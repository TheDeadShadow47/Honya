// Gesture state machine for the interactive page curl. Pure functions over plain scalars: no React,
// no Reanimated imports, so the exact logic that runs in the UI-thread worklets is also what the
// node tests execute. Every function takes a state object and returns a new one.
//
// Interaction model (identical principles in both directions):
//   * Where the finger lands picks the turn: the outer half on the "forward" side grabs the current
//     page to turn it forward, the other half grabs the previous page and pulls it back. In LTR the
//     forward side is the right half, in RTL the left half. Direction is decided from the touch-down
//     position, never from the first few pixels of motion, so a jittery start cannot pick the wrong one.
//   * Progress follows the finger continuously, in both directions, and may be reversed at any time;
//     dragging back to the start restores the page.
//   * Forward: the finger holds the page's free corner (tip), so the tip tracks the finger 1:1.
//     Backward: the finger holds the rolled edge of the returning page, so that edge tracks the
//     finger 1:1 (the tip travels twice as far, which is what a fold does).
//   * Release: far enough or fast enough commits, otherwise the page falls back. While a release or
//     tap turn settles, new touches are ignored (busy = 2).

import { shouldComplete } from './pageCurl.js';

export const IDLE = 0;
export const DRAGGING = 1;
export const SETTLING = 2;

export const TAP_TURN_MS = 380;
export const MIN_SETTLE_MS = 160;
export const TAP_LIFT = 0.14; // tap turns lift their corner by this fraction of the page height
export const MAX_LIFT = 0.3;

export function initialState(H) {
  'worklet';
  return { busy: IDLE, dir: 0, d: 0, inward: 0, corner: H, armed: false, pendingDir: 0, startX: 0, startY: 0 };
}

/** Which turn a touch-down at `x` grabs: 1 forward, -1 backward, 0 none available (first/last page). */
export function grabDirection(x, W, rtl, canNext, canPrev) {
  'worklet';
  const onForwardSide = rtl ? x < W / 2 : x >= W / 2;
  if (onForwardSide) return canNext ? 1 : 0;
  return canPrev ? -1 : 0;
}

/** Sign that maps a screen-space horizontal movement onto travel in the turn direction (positive = turning). */
export function travelSign(dir, rtl) {
  'worklet';
  return (dir === 1 ? -1 : 1) * (rtl ? -1 : 1);
}

/** Curl progress `d` (0..2W) for a finger travel `f` (>= 0) in the turn direction. */
export function progressForTravel(dir, f, W) {
  'worklet';
  const k = dir === 1 ? 1 : 2; // see the interaction model above
  return Math.max(0, Math.min(2 * W, k * f));
}

/** Finger travel that produced progress `d` (inverse of progressForTravel). */
export function travelForProgress(dir, d) {
  'worklet';
  return dir === 1 ? d : d / 2;
}

/** Finger down: remember where, and whether this touch may drive a turn at all. */
export function begin(s, x, y, cfg) {
  'worklet';
  if (s.busy !== IDLE) return { ...s, armed: false, pendingDir: 0 }; // a turn is settling: ignore this touch
  return { ...s, armed: true, pendingDir: grabDirection(x, cfg.W, cfg.rtl, cfg.canNext, cfg.canPrev), startX: x, startY: y };
}

/** Pan activated (the finger has travelled far enough sideways). Returns the new state; `mount` says layers must be shown. */
export function activate(s, cfg) {
  'worklet';
  if (!s.armed || s.busy !== IDLE || s.pendingDir === 0) return { s: { ...s, armed: false }, mount: false };
  return {
    s: {
      ...s,
      busy: DRAGGING,
      dir: s.pendingDir,
      d: 0,
      inward: 0,
      corner: s.startY < cfg.H / 2 ? 0 : cfg.H,
    },
    mount: true,
  };
}

/** Finger moved: translation (tx, ty) from the touch-down point. */
export function move(s, tx, ty, cfg) {
  'worklet';
  if (s.busy !== DRAGGING) return s;
  const f = Math.max(0, travelSign(s.dir, cfg.rtl) * tx);
  const lift = s.corner === 0 ? ty : -ty;
  return { ...s, d: progressForTravel(s.dir, f, cfg.W), inward: Math.max(-MAX_LIFT * cfg.H, Math.min(MAX_LIFT * cfg.H, lift)) };
}

/** What a settle animation should do. */
function settleFor(s, complete, cfg) {
  'worklet';
  const target = complete ? 2 * cfg.W : 0;
  const remaining = Math.abs(target - s.d) / (2 * cfg.W);
  return { target, complete, duration: Math.max(MIN_SETTLE_MS, Math.round(TAP_TURN_MS * (0.4 + remaining))) };
}

/** Finger up with horizontal velocity `vx` (px/s, screen space). */
export function release(s, vx, cfg) {
  'worklet';
  if (s.busy !== DRAGGING) return { s, settle: null };
  const f = travelForProgress(s.dir, s.d);
  const complete = shouldComplete(f, travelSign(s.dir, cfg.rtl) * vx, cfg.W);
  return { s: { ...s, busy: SETTLING }, settle: settleFor(s, complete, cfg) };
}

/** The system took the touch away after activation (no release): put the page back. */
export function abort(s, cfg) {
  'worklet';
  if (s.busy !== DRAGGING) return { s, settle: null };
  return { s: { ...s, busy: SETTLING }, settle: settleFor(s, false, cfg) };
}

/** A tap on a page-turn zone: play the whole turn from the bottom corner. `delta` is +1 forward / -1 backward. */
export function tapTurn(s, delta, cfg) {
  'worklet';
  if (s.busy !== IDLE) return { s, play: null };
  if (delta > 0 ? !cfg.canNext : !cfg.canPrev) return { s, play: null };
  const dir = delta > 0 ? 1 : -1;
  return {
    s: { ...s, busy: SETTLING, dir, d: 0, inward: TAP_LIFT * cfg.H, corner: cfg.H },
    play: { target: 2 * cfg.W, duration: TAP_TURN_MS },
  };
}

/** A settle animation ended. `delta` is the page change to commit (0 when the turn was cancelled). */
export function done(s, complete) {
  'worklet';
  const delta = complete ? s.dir : 0;
  // dir and d stay as they are: the layers are still on screen until React unmounts them, and resetting
  // the curl here would flash the old page for a frame. The next activation starts from d = 0.
  return { s: { ...s, busy: IDLE, armed: false, pendingDir: 0 }, delta };
}
