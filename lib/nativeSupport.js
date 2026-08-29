import { isRunningInExpoGo } from 'expo';

/**
 * True when the app is running inside Expo Go.
 *
 * Native-only features (notifications, background tasks, SAF, APK install,
 * etc.) are intentionally not available in Expo Go. Callers use this to skip
 * that native functionality gracefully instead of letting an unavailable
 * native module crash the rest of the app. In development builds and
 * production APKs this returns false, so the native implementations remain
 * fully intact and untouched.
 */
export function isExpoGo() {
  return isRunningInExpoGo();
}
