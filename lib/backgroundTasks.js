import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

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

// Define a background task. Call this at module level in each task file.
function defineTask(taskName, executor, options = {}) {
  TaskManager.defineTask(taskName, async () => {
    if (taskState[taskName]?.running) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    taskState[taskName] = { running: true, state: TASK_STATE.RUNNING, lastRun: Date.now() };
    console.log(`[BackgroundTask] started: ${taskName}`);

    try {
      await executor();
      taskState[taskName] = { running: false, state: TASK_STATE.SUCCESS, lastRun: Date.now() };
      console.log(`[BackgroundTask] completed: ${taskName}`);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (e) {
      taskState[taskName] = { running: false, state: TASK_STATE.FAILED, lastRun: Date.now(), error: e.message };
      console.warn(`[BackgroundTask] failed: ${taskName}`, e.message);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });

  TASKS.push({ name: taskName, minimumInterval: options.minimumInterval || 15 * 60 });
}

// Register all defined tasks with BackgroundFetch — call once at startup
export async function registerBackgroundTasks() {
  for (const task of TASKS) {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(task.name);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(task.name, {
          minimumInterval: task.minimumInterval,
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log(`[BackgroundTask] registered: ${task.name}`);
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

// Check if background fetch is available on this device
export async function isBackgroundFetchAvailable() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    return (
      status === BackgroundFetch.BackgroundFetchStatus.Available ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted
    );
  } catch {
    return false;
  }
}

// Unregister a specific task
export async function unregisterTask(taskName) {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(taskName);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(taskName);
      console.log(`[BackgroundTask] unregistered: ${taskName}`);
    }
  } catch {}
}

export { defineTask };
