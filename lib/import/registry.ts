// In-memory job registry. Mirrors the desktop's `tasks` map + listener
// pattern so the UI can subscribe to live updates from anywhere in the
// app and the orchestrator can patch state generically.

import type { ImportTaskProgress } from './types';

type Listener = (state: ImportTaskProgress) => void;

interface RunningTask {
  state: ImportTaskProgress;
  /** AbortController for in-flight fetch / download. */
  controller: AbortController;
  cancelled: boolean;
}

const tasks = new Map<string, RunningTask>();
const listeners = new Set<Listener>();

export function onImportProgress(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(state: ImportTaskProgress): void {
  for (const cb of listeners) {
    try { cb(state); } catch { /* ignore */ }
  }
}

export function registerTask(initial: ImportTaskProgress, controller: AbortController): void {
  tasks.set(initial.taskId, { state: initial, controller, cancelled: false });
  emit(initial);
}

export function getTask(taskId: string): RunningTask | undefined {
  return tasks.get(taskId);
}

export function patch(taskId: string, p: Partial<ImportTaskProgress>): ImportTaskProgress | null {
  const t = tasks.get(taskId);
  if (!t) return null;
  t.state = { ...t.state, ...p };
  emit(t.state);
  return t.state;
}

export function listTasks(): ImportTaskProgress[] {
  return Array.from(tasks.values())
    .map(t => t.state)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function cancelTask(taskId: string): void {
  const t = tasks.get(taskId);
  if (!t) return;
  t.cancelled = true;
  try { t.controller.abort(); } catch { /* ignore */ }
  patch(taskId, { status: 'cancelled' });
}

export function isCancelled(taskId: string): boolean {
  return tasks.get(taskId)?.cancelled ?? false;
}

export function clearFinished(): void {
  for (const [id, t] of tasks) {
    if (t.state.status === 'done' || t.state.status === 'error' || t.state.status === 'cancelled') {
      tasks.delete(id);
    }
  }
}

export function removeTask(taskId: string): void {
  tasks.delete(taskId);
}

/** Bulk remove a set of task ids (no cancellation — caller decides). */
export function removeTasks(taskIds: string[]): void {
  for (const id of taskIds) tasks.delete(id);
}

/**
 * Cancel every running task (so any in-flight fetches abort) and drop
 * the whole list. Used by the "Clear all import history" action.
 */
export function clearAll(): void {
  for (const [, t] of tasks) {
    if (!t.cancelled) {
      t.cancelled = true;
      try { t.controller.abort(); } catch { /* ignore */ }
    }
  }
  tasks.clear();
}
