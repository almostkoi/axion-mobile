// Public API for the import subsystem.
//
// startImport(payload)        → kicks off a new task, returns the taskId
// cancelTask(taskId)
// listTasks() / onImportProgress(cb)
// classifyUrl(raw)            → re-export for the UI

import { classifyUrl, sourceLabel } from './classify';
import {
  registerTask, patch, cancelTask, listTasks, onImportProgress,
  isCancelled, removeTask, clearFinished, getTask
} from './registry';
import type { ImportTaskProgress, StartImportPayload, ImportSource } from './types';

import { importFromYouTube } from './sources/youtube';
import { importFromSoundCloud } from './sources/soundcloud';
import { importFromDirect } from './sources/direct';
import { resolveSpotify } from './sources/spotify';
import { resolveLastFm } from './sources/lastfm';
import { searchYouTube } from './search/youtubeSearch';
import { refreshLibrary } from '../../hooks/useLibrary';

export { classifyUrl, sourceLabel };
export {
  cancelTask, listTasks, onImportProgress, removeTask, clearFinished
};
export type { ImportTaskProgress, ImportSource, StartImportPayload };

let taskCounter = 0;
function nextId(): string {
  taskCounter += 1;
  return `imp_${Date.now().toString(36)}_${taskCounter}`;
}

export async function startImport(payload: StartImportPayload): Promise<string> {
  const url = payload.url.trim();
  if (!url) throw new Error('URL is empty');
  const source = classifyUrl(url);
  const taskId = nextId();
  const controller = new AbortController();

  const initial: ImportTaskProgress = {
    taskId, url, source,
    status: 'queued', title: null, progress: -1,
    downloadedBytes: 0, totalBytes: 0,
    filePath: null, errorMessage: null,
    createdAt: Date.now()
  };
  registerTask(initial, controller);
  void runPipeline(taskId, url, source);
  return taskId;
}

async function runPipeline(taskId: string, url: string, source: ImportSource): Promise<void> {
  const checkCancel = (): boolean => isCancelled(taskId);

  const onTitle = (t: string): void => { patch(taskId, { title: t }); };
  const onProgress = (received: number, total: number): void => {
    patch(taskId, {
      status: 'downloading',
      downloadedBytes: received,
      totalBytes: total,
      progress: total > 0 ? received / total : -1
    });
  };

  try {
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
      title: savedTrack.title ? `${savedTrack.artist} \u2014 ${savedTrack.title}` : savedTrack.title
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
  }
}

/** Re-fetch a task by id (e.g., to display in a detail view). */
export function getTaskById(taskId: string): ImportTaskProgress | null {
  const t = getTask(taskId);
  return t ? t.state : null;
}
