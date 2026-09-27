/**
 * Text-to-speech ("Listen" / "Read Aloud") playback for the currently open chapter.
 *
 * Built on expo-speech, which wraps the platform's native TTS engine
 * (TextToSpeech on Android, AVSpeechSynthesizer on iOS). expo-speech is already an
 * Expo SDK package (matching this project's `expo-*` dependency style) and needs no
 * extra native configuration on either platform, so no other approach was considered.
 *
 * Platform limitations that shape the design below:
 * - Android's TextToSpeech engine rejects/truncates very long utterances (historically
 *   ~4000 characters, and it varies by OS version/engine), so a chapter is spoken in
 *   chunks rather than as one call. See chunkText().
 * - `Speech.pause()`/`Speech.resume()` are iOS/web only — Android has no native pause.
 *   To behave the same on both platforms, pause/resume here is implemented uniformly as
 *   "stop the current utterance and remember which chunk we were on" / "re-speak from
 *   that chunk". The trade-off: resuming restarts the current chunk from its beginning
 *   rather than the exact word — acceptable since chunks are at most a paragraph or two.
 * - There is no reliable background/lock-screen playback without a foreground audio
 *   session (iOS background audio mode + an Android foreground service), which this
 *   MVP does not add. Speech is expected to stop (or the OS may kill it) if the app is
 *   backgrounded — a known limitation, not a bug in this module.
 */
import * as Speech from 'expo-speech';
import { chunkText } from './ttsChunk';

export { chunkText };

// ── Session state (one chapter can be "listened to" at a time, app-wide) ────────────────

let chunks = [];
let index = 0;
let playing = false;
let sessionKey = null; // usually the chapter id; lets the reader screen tell "this session is mine"
let playOpts = { rate: 1.0, language: undefined };
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const snapshot = getState();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

export function getState() {
  return { sessionKey, playing, index, total: chunks.length };
}

function speakFrom(i) {
  if (i >= chunks.length) {
    playing = false;
    index = chunks.length;
    emit();
    return;
  }
  index = i;
  emit();
  Speech.speak(chunks[i], {
    rate: playOpts.rate,
    language: playOpts.language,
    onDone: () => speakFrom(i + 1),
    // Fired by our own pause()/stop() calling Speech.stop(); no action needed — those
    // functions already set the state they want before stopping the utterance.
    onStopped: () => {},
    onError: () => {
      playing = false;
      emit();
    },
  });
}

/** Start reading `text` from the top. `key` identifies the session (pass the chapter id). */
export function play(key, text, { rate = 1.0, language } = {}) {
  Speech.stop();
  sessionKey = key;
  chunks = chunkText(text);
  index = 0;
  playOpts = { rate, language };
  playing = chunks.length > 0;
  emit();
  if (playing) speakFrom(0);
}

/** Stop the current utterance but keep the session/position so resume() can continue. */
export function pause() {
  if (!playing) return;
  playing = false;
  Speech.stop();
  emit();
}

/** Re-speak from the chunk that was active when pause() was called. */
export function resume() {
  if (playing || !chunks.length || index >= chunks.length) return;
  playing = true;
  emit();
  speakFrom(index);
}

/** Stop entirely and forget the session (a fresh play() starts from the top). */
export function stop() {
  const wasActive = playing || chunks.length > 0;
  playing = false;
  chunks = [];
  index = 0;
  sessionKey = null;
  Speech.stop();
  if (wasActive) emit();
}
