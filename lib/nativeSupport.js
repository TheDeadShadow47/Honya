import { isRunningInExpoGo } from 'expo';

// Native-only features are unavailable in Expo Go; callers skip them gracefully instead of crashing.
export function isExpoGo() {
  return isRunningInExpoGo();
}
