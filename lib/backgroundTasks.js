import { isExpoGo } from './nativeSupport';

// Background execution uses expo-background-task (Android WorkManager) + expo-task-manager; the older
// expo-background-fetch (JobScheduler) is deprecated and less reliable across process termination. These
// call requireNativeModule() at import and throw when absent, so load them only outside Expo Go.
let BackgroundTask = null;
let TaskManager = null;
if (!isExpoGo()) {
  try {
    BackgroundTask = require('expo-background-task');
    TaskManager = require('expo-task-manager');
  } catch (e) {
    console.warn('[BackgroundTask] native modules unavailable', e?.message);
  }
}

// Task states
export const TASK_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
};

// Registered tasks — populated by defineTask() at module level
const TASKS = [];

// In-memory task state — prevents duplicate concurrent runs
const taskState = {};

// `minimumInterval` is an *inexact* MINUTES lower bound — the OS decides when the task runs (battery,
// network, Doze). All Honya tasks share a single native worker with the same 15-minute floor, so the
// last-registered interval applying to shared scheduling is fine. Executors must finish within the window.
function defineTask(taskName, executor, options = {}) {
  // Unavailable in Expo Go — skip silently so the app still starts; nothing is registered natively.
  if (!TaskManager || !BackgroundTask) {
    console.warn(`[BackgroundTask] "${taskName}" skipped (background tasks unavailable in this environment)`);
    return;
  }
  TaskManager.defineTask(taskName, async () => {
    if (taskState[taskName]?.running) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    taskState[taskName] = { running: true, state: TASK_STATE.RUNNING, lastRun: Date.now() };
    console.log(`[BackgroundTask] started: ${taskName}`);

    try {
      await executor();
      taskState[taskName] = { running: false, state: TASK_STATE.SUCCESS, lastRun: Date.now() };
      console.log(`[BackgroundTask] completed: ${taskName}`);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      taskState[taskName] = { running: false, state: TASK_STATE.FAILED, lastRun: Date.now(), error: e.message };
      console.warn(`[BackgroundTask] failed: ${taskName}`, e.message);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  TASKS.push({ name: taskName, minimumInterval: options.minimumInterval || 15 });
}

// Register all defined tasks with BackgroundTask — call once at startup
export async function registerBackgroundTasks() {
  if (!TaskManager || !BackgroundTask) return;
  for (const task of TASKS) {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(task.name);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(task.name, {
          minimumInterval: task.minimumInterval,
        });
        console.log(`[BackgroundTask] registered: ${task.name} (min ${task.minimumInterval}m)`);
      }
    } catch (e) {
      console.warn(`[BackgroundTask] registration failed: ${task.name}`, e.message);
    }
  }
}

// Check if a specific task is currently running
export function isTaskRunning(taskName) {
  return taskState[taskName]?.running === true;
}

// Get the state of a specific task
export function getTaskState(taskName) {
  return taskState[taskName] || { running: false, state: TASK_STATE.IDLE };
}

// Prevent the same task from running concurrently.
// Returns true if the task can proceed, false if it's already running.
export function acquireTaskLock(taskName) {
  if (taskState[taskName]?.running) return false;
  taskState[taskName] = { running: true, state: TASK_STATE.RUNNING, lastRun: Date.now() };
  return true;
}

// Release a task lock after completion
export function releaseTaskLock(taskName, success = true, error = null) {
  taskState[taskName] = {
    running: false,
    state: success ? TASK_STATE.SUCCESS : TASK_STATE.FAILED,
    lastRun: Date.now(),
    ...(error ? { error } : {}),
  };
}

// Check if background tasks are available on this device
export async function isBackgroundFetchAvailable() {
  if (!BackgroundTask) return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    return status === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}

// Unregister a specific task
export async function unregisterTask(taskName) {
  if (!TaskManager || !BackgroundTask) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(taskName);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(taskName);
      console.log(`[BackgroundTask] unregistered: ${taskName}`);
    }
  } catch {}
}

export { defineTask };
