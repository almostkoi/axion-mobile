// Public API for the import subsystem.
//
// startImport(payload)        → kicks off a new task, returns the taskId.
//                                For playlist URLs this fans out to one
//                                task per track; the returned id is the
//                                first track's.
// cancelTask(taskId)
// listTasks() / onImportProgress(cb)
// classifyUrl(raw)            → re-export for the UI

import { classifyUrl, sourceLabel } from './classify';
import {
  registerTask, patch, cancelTask, listTasks, onImportProgress,
  isCancelled, removeTask, removeTasks, clearFinished, clearAll, getTask
} from './registry';
import type { ImportTaskProgress, StartImportPayload, ImportSource } from './types';

import { importFromYouTube } from './sources/youtube';
import { importFromSoundCloud } from './sources/soundcloud';
import { importFromDirect } from './sources/direct';
import { resolveSpotify } from './sources/spotify';
import { resolveLastFm } from './sources/lastfm';
import { searchYouTube } from './search/youtubeSearch';
import {
  isPlaylistOnlyUrl, resolvePlaylistAllVideos, type PlaylistVideo
} from './sources/ytPlaylist';
import { useStore } from '../../store/useStore';
import { refreshLibrary } from '../../hooks/useLibrary';

export { classifyUrl, sourceLabel };
export {
  cancelTask, listTasks, onImportProgress,
  removeTask, removeTasks, clearFinished, clearAll
};
export type { ImportTaskProgress, ImportSource, StartImportPayload };

let taskCounter = 0;
function nextId(): string {
  taskCounter += 1;
  return `imp_${Date.now().toString(36)}_${taskCounter}`;
}

// ─── Concurrency limiter ────────────────────────────────────────────
//
// Protects Piped / Invidious / the phone's network stack from a burst of
// N parallel downloads when the user pastes a long playlist. Also gives
// sequential audio writes so SQLite doesn't see N concurrent INSERTs.
//
// Tasks sit in 'queued' until the semaphore grants them a slot; then
// they progress to 'resolving' and the rest of the existing pipeline
// runs unchanged.

const MAX_CONCURRENT_IMPORTS = 3;
let activeImports = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeImports < MAX_CONCURRENT_IMPORTS) {
    activeImports += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => { waitQueue.push(resolve); });
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    // Keep activeImports steady — we hand our slot straight to the next waiter.
    next();
  } else {
    activeImports = Math.max(0, activeImports - 1);
  }
}

// ─── Single-track task registration + pipeline ───────────────────────

interface EnqueueOptions {
  /** Optional prefix prepended to the task's user-facing title (e.g. "[Playlist: Discovery]"). */
  titlePrefix?: string;
  /** Initial title to show before resolution kicks in. */
  initialTitle?: string | null;
}

function enqueueSingleTrackImport(
  rawUrl: string,
  opts: EnqueueOptions = {}
): string {
  const url = rawUrl.trim();
  const source = classifyUrl(url);
  const taskId = nextId();
  const controller = new AbortController();

  const initial: ImportTaskProgress = {
    taskId, url, source,
    status: 'queued',
    title: opts.initialTitle ?? null,
    progress: -1,
    downloadedBytes: 0, totalBytes: 0,
    filePath: null, errorMessage: null,
    createdAt: Date.now()
  };
  registerTask(initial, controller);
  void runPipeline(taskId, url, source, opts.titlePrefix);
  return taskId;
}

// ─── Public entry point ──────────────────────────────────────────────

export async function startImport(payload: StartImportPayload): Promise<string> {
  const url = payload.url.trim();
  if (!url) throw new Error('URL is empty');

  const source = classifyUrl(url);

  // Playlist URLs fan out into one task per track so the user can see and
  // cancel individual downloads in the Jobs panel.
  if ((source === 'youtube' || source === 'youtubeMusic') && isPlaylistOnlyUrl(url)) {
    return startPlaylistImport(url);
  }

  return enqueueSingleTrackImport(url);
}

async function startPlaylistImport(url: string): Promise<string> {
  // Create a placeholder task straight away so the user gets immediate
  // feedback ("resolving playlist..."). If resolution fails we convert
  // it to an error task; if it succeeds we delete the placeholder and
  // register per-track tasks.
  const placeholderId = nextId();
  const placeholderController = new AbortController();
  registerTask({
    taskId: placeholderId, url, source: classifyUrl(url),
    status: 'resolving',
    title: 'Resolving playlist\u2026',
    progress: -1,
    downloadedBytes: 0, totalBytes: 0,
    filePath: null, errorMessage: null,
    createdAt: Date.now()
  }, placeholderController);

  const piped = useStore.getState().settings.pipedInstance?.trim() ?? '';

  let listing;
  try {
    listing = await resolvePlaylistAllVideos(url, piped);
  } catch (err) {
    patch(placeholderId, {
      status: 'error',
      errorMessage:
        `Could not expand playlist.\n\n` +
        (err instanceof Error ? err.message : String(err)) +
        `\n\nTip: set a working Piped instance in Settings \u2192 YouTube proxy.`
    });
    return placeholderId;
  }

  if (listing.videos.length === 0) {
    patch(placeholderId, {
      status: 'error',
      errorMessage: 'Playlist resolved but contained no streamable tracks.'
    });
    return placeholderId;
  }

  // Retire the placeholder now that we have a concrete listing.
  removeTask(placeholderId);

  const playlistName = (listing.playlistTitle ?? '').trim();
  const prefix = playlistName
    ? `[${playlistName}] `
    : '[Playlist] ';

  // Register everything up front so the Jobs panel shows them all
  // immediately, then the concurrency limiter meters the actual work.
  const firstTaskId = enqueueSingleTrackImport(videoUrl(listing.videos[0]), {
    titlePrefix: prefix,
    initialTitle: prefix + formatTrackTitle(listing.videos[0])
  });
  for (let i = 1; i < listing.videos.length; i += 1) {
    const v = listing.videos[i];
    enqueueSingleTrackImport(videoUrl(v), {
      titlePrefix: prefix,
      initialTitle: prefix + formatTrackTitle(v)
    });
  }

  if (listing.truncated) {
    console.warn(
      `[axion] playlist truncated to ${listing.videos.length} tracks; ` +
      `the full playlist is longer. Paste again from a later point to fetch more.`
    );
  }
  return firstTaskId;
}

function videoUrl(v: PlaylistVideo): string {
  return `https://www.youtube.com/watch?v=${v.videoId}`;
}

function formatTrackTitle(v: PlaylistVideo): string {
  return v.author ? `${v.author} \u2014 ${v.title}` : v.title;
}

// ─── Pipeline (unchanged behaviour + semaphore + optional prefix) ────

async function runPipeline(
  taskId: string,
  url: string,
  source: ImportSource,
  titlePrefix?: string
): Promise<void> {
  const checkCancel = (): boolean => isCancelled(taskId);

  const withPrefix = (t: string | null): string | null => {
    if (t == null) return null;
    if (!titlePrefix) return t;
    return t.startsWith(titlePrefix) ? t : titlePrefix + t;
  };

  const onTitle = (t: string): void => { patch(taskId, { title: withPrefix(t) }); };
  const onProgress = (received: number, total: number): void => {
    patch(taskId, {
      status: 'downloading',
      downloadedBytes: received,
      totalBytes: total,
      progress: total > 0 ? received / total : -1
    });
  };

  // Block here until we have a concurrency slot. Until we do, the task
  // stays in the 'queued' state the registry already assigned it.
  await acquireSlot();

  try {
    if (checkCancel()) {
      patch(taskId, { status: 'cancelled' });
      return;
    }
    patch(taskId, { status: 'resolving' });

    let effectiveSource = source;
    let effectiveUrl = url;

    // Spotify / Last.fm / generic → resolve to a YT search.
    if (source === 'spotify' || source === 'lastfm' || source === 'generic') {
      const meta = source === 'spotify'
        ? await resolveSpotify(url)
        : source === 'lastfm'
          ? await resolveLastFm(url)
          : { title: url, artist: '' };
      const query = [meta.artist, meta.title].filter(Boolean).join(' ').trim();
      if (!query) {
        throw new Error('Could not extract artist/title from URL');
      }
      onTitle(query);
      const hit = await searchYouTube(query);
      if (!hit) throw new Error(`No YouTube match for "${query}"`);
      effectiveSource = 'youtube';
      effectiveUrl = hit.url;
    }

    if (checkCancel()) return;
    patch(taskId, { status: 'downloading', progress: 0 });

    let savedTrack;
    if (effectiveSource === 'youtube' || effectiveSource === 'youtubeMusic') {
      savedTrack = await importFromYouTube({
        url: effectiveUrl, taskId,
        isCancelled: checkCancel, onTitle, onProgress
      });
    } else if (effectiveSource === 'soundcloud') {
      savedTrack = await importFromSoundCloud({
        url: effectiveUrl, taskId,
        isCancelled: checkCancel, onTitle, onProgress
      });
    } else if (effectiveSource === 'direct') {
      savedTrack = await importFromDirect({
        url: effectiveUrl, taskId,
        isCancelled: checkCancel, onTitle, onProgress
      });
    } else {
      throw new Error(`Unsupported source: ${effectiveSource}`);
    }

    patch(taskId, {
      status: 'done',
      progress: 1,
      filePath: savedTrack.filePath,
      title: withPrefix(
        savedTrack.title ? `${savedTrack.artist} \u2014 ${savedTrack.title}` : savedTrack.title
      )
    });
    // Hydrate the in-memory library so the new track shows up immediately.
    try { await refreshLibrary(); } catch (err) { console.warn('[axion] refreshLibrary failed', err); }
  } catch (err) {
    if (checkCancel()) {
      patch(taskId, { status: 'cancelled' });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    patch(taskId, { status: 'error', errorMessage: msg });
  } finally {
    releaseSlot();
  }
}

/** Re-fetch a task by id (e.g., to display in a detail view). */
export function getTaskById(taskId: string): ImportTaskProgress | null {
  const t = getTask(taskId);
  return t ? t.state : null;
}
