/**
 * expo-speech wraps native TTS (TextToSpeech on Android, AVSpeechSynthesizer on iOS) and needs no
 * extra native setup. Android rejects very long utterances (~4000 chars, varying by engine), so text
 * is spoken in chunks. `pause()`/`resume()` are iOS/web only; pause stops and resume re-speaks from
 * the active chunk, restarting it rather than resuming mid-word. Background playback isn't reliable
 * without a foreground audio session, so speech may stop when backgrounded — a known limitation.
 */
import * as Speech from 'expo-speech';
import { chunkText } from './ttsChunk';

export { chunkText };

// One session app-wide.
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

export function pause() {
  if (!playing) return;
  playing = false;
  Speech.stop();
  emit();
}

export function resume() {
  if (playing || !chunks.length || index >= chunks.length) return;
  playing = true;
  emit();
  speakFrom(index);
}

export function stop() {
  const wasActive = playing || chunks.length > 0;
  playing = false;
  chunks = [];
  index = 0;
  sessionKey = null;
  Speech.stop();
  if (wasActive) emit();
}
