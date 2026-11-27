// Interaction tests for the page-curl gesture (lib/curlGesture.js + lib/pageCurl.js).
//
// These drive the SAME state machine the UI-thread worklets run, with simulated pointer events
// (touch-down, move, up, settle-finished). They prove the decision logic: which turn a touch grabs,
// that progress follows the finger in both directions, reversal, commit/cancel by distance and
// velocity, RTL, first/last page boundaries and overlap protection.
// They do NOT prove that Android delivers those events, that Reanimated runs the worklets, or how
// it feels: that needs a physical device.
//
// Run with: node scripts/test-curlgesture.js
import assert from 'node:assert/strict';
import * as g from '../lib/curlGesture.js';
import { curlState, tipForDrag } from '../lib/pageCurl.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

const W = 360;
const H = 640;
const ACTIVE_X = 10;

/** A pointer-driven harness mirroring components/PageCurl.js: begin -> (activate after 10px) -> move -> release -> settle. */
function harness({ rtl = false, canNext = true, canPrev = true } = {}) {
  const cfg = { W, H, rtl, canNext, canPrev };
  const h = {
    cfg,
    s: g.initialState(H),
    mounted: 0, // times layers were mounted
    settle: null,
    commits: [],
    down(x, y) {
      h.s = g.begin(h.s, x, y, cfg);
      h.active = false;
      return h;
    },
    move(tx, ty = 0) {
      if (!h.active && Math.abs(tx) >= ACTIVE_X) {
        const r = g.activate(h.s, cfg);
        h.s = r.s;
        h.active = true;
        if (r.mount) h.mounted += 1;
      }
      if (h.active) h.s = g.move(h.s, tx, ty, cfg);
      return h;
    },
    up(vx = 0) {
      if (!h.active) return h;
      const r = g.release(h.s, vx, cfg);
      if (r.settle) {
        h.s = r.s;
        h.settle = r.settle;
      }
      return h;
    },
    finishSettle() {
      assert.ok(h.settle, 'a settle animation was started');
      const r = g.done(h.s, h.settle.complete);
      h.s = r.s;
      h.commits.push(r.delta);
      h.settle = null;
      return r.delta;
    },
    /** Screen-space curl for the current state. */
    curl() {
      return curlState(h.s.dir === 1 ? 'next' : 'prev', h.s.d, h.s.inward, h.s.corner, rtl, W, H);
    },
  };
  return h;
}

check('touch-down side picks the turn: right half forward / left half back (LTR), mirrored in RTL', () => {
  assert.equal(g.grabDirection(W - 5, W, false, true, true), 1);
  assert.equal(g.grabDirection(5, W, false, true, true), -1);
  assert.equal(g.grabDirection(5, W, true, true, true), 1);
  assert.equal(g.grabDirection(W - 5, W, true, true, true), -1);
});

check('forward drag: the page tip follows the finger 1:1 from the right edge', () => {
  const h = harness().down(W, 600);
  for (const tx of [-12, -40, -120, -250]) {
    h.move(tx);
    near(h.s.d, -tx, 'progress');
    const [tipX] = tipForDrag('next', h.s.d, 0, H, W, H);
    near(tipX, W + tx, 'tip x equals finger x');
  }
  assert.equal(h.mounted, 1);
});

check('backward drag: the rolled edge follows the finger 1:1 from the left edge', () => {
  const h = harness().down(0, 600);
  for (const tx of [12, 40, 120, 250]) {
    h.move(tx);
    near(h.s.d, 2 * tx, 'tip travels twice as far');
    const c = h.curl();
    assert.ok(c.active);
    // the fold line sits at the finger; the visible roll is just behind it (towards the tip)
    near(c.mx, tx, 'fold x equals finger x');
  }
  assert.equal(h.mounted, 1);
});

check('both directions respond from the very first pixels (no dead zone after activation)', () => {
  for (const [x0, tx] of [[W, -ACTIVE_X], [0, ACTIVE_X]]) {
    const h = harness().down(x0, 600).move(tx);
    assert.equal(h.s.busy, g.DRAGGING);
    assert.ok(h.s.d > 0);
  }
});

check('reversing before release: progress goes back down and can return to the start', () => {
  for (const [x0, sign, dir] of [[W, -1, 'next'], [0, 1, 'prev']]) {
    const h = harness().down(x0, 600);
    h.move(sign * 200);
    const far = h.s.d;
    h.move(sign * 80);
    assert.ok(h.s.d < far, `${dir} moves back`);
    h.move(sign * 150);
    assert.ok(h.s.d > g.progressForTravel(dir === 'next' ? 1 : -1, 80, W), `${dir} moves forward again`);
    h.move(-sign * 40); // past the start the other way: the page is simply fully restored
    assert.equal(h.s.d, 0);
    h.up(0);
    assert.equal(h.settle.complete, false);
    assert.equal(h.finishSettle(), 0);
  }
});

check('commit by distance (forward): past 40% of the width commits, below it restores', () => {
  const yes = harness().down(W, 600).move(-0.45 * W).up(0);
  assert.equal(yes.settle.complete, true);
  assert.equal(yes.settle.target, 2 * W);
  assert.equal(yes.finishSettle(), 1);
  const no = harness().down(W, 600).move(-0.3 * W).up(0);
  assert.equal(no.settle.complete, false);
  assert.equal(no.settle.target, 0);
  assert.equal(no.finishSettle(), 0);
});

check('commit by distance (backward) uses finger travel, not the doubled curl progress', () => {
  const no = harness().down(0, 600).move(0.3 * W).up(0); // d = 0.6W would pass a naive 0.4W test
  assert.equal(no.settle.complete, false);
  assert.equal(no.finishSettle(), 0);
  const yes = harness().down(0, 600).move(0.45 * W).up(0);
  assert.equal(yes.settle.complete, true);
  assert.equal(yes.finishSettle(), -1);
});

check('commit by velocity: a quick flick completes a short drag; a flick back cancels a long one', () => {
  assert.equal(harness().down(W, 600).move(-0.1 * W).up(-900).settle.complete, true); // forward flick
  assert.equal(harness().down(0, 600).move(0.1 * W).up(900).settle.complete, true); // backward flick
  assert.equal(harness().down(W, 600).move(-0.7 * W).up(900).settle.complete, false); // flicked back
  assert.equal(harness().down(0, 600).move(0.7 * W).up(-900).settle.complete, false);
  assert.equal(harness().down(W, 600).move(-0.01 * W - 10).up(-900).settle.complete, false); // a twitch is not a flick
});

check('cancel: releasing early plays back to the start and commits nothing; the page index does not move', () => {
  const h = harness().down(W, 600).move(-60).up(0);
  assert.equal(h.settle.target, 0);
  assert.equal(h.finishSettle(), 0);
  assert.deepEqual(h.commits, [0]);
});

check('abort (system cancels the touch after activation) restores the page', () => {
  const h = harness().down(W, 600).move(-100);
  const r = g.abort(h.s, h.cfg);
  assert.equal(r.settle.complete, false);
  assert.equal(r.settle.target, 0);
  assert.equal(g.abort(g.initialState(H), h.cfg).settle, null);
});

check('RTL: forward is a drag to the right from the left half; backward a drag to the left from the right half', () => {
  const f = harness({ rtl: true }).down(0, 600).move(0.45 * W);
  assert.equal(f.s.dir, 1);
  near(f.s.d, 0.45 * W, 'forward progress');
  assert.equal(f.up(0).settle.complete, true);
  assert.equal(f.finishSettle(), 1);
  const b = harness({ rtl: true }).down(W, 600).move(-0.45 * W);
  assert.equal(b.s.dir, -1);
  near(b.s.d, 0.9 * W, 'backward progress');
  assert.equal(b.up(0).settle.complete, true);
  assert.equal(b.finishSettle(), -1);
  // dragging the other way does nothing
  const wrong = harness({ rtl: true }).down(0, 600).move(-100);
  assert.equal(wrong.s.d, 0);
});

check('RTL: the curl is the mirror image of LTR (tip tracks the finger from the left edge)', () => {
  const l = harness().down(W, 600).move(-150);
  const r = harness({ rtl: true }).down(0, 600).move(150);
  near(r.curl().mx, W - l.curl().mx, 'fold mirrored');
  near(r.curl().nx, -l.curl().nx, 'normal mirrored');
});

check('wrong-way drag from a grab side never turns the page, even with velocity', () => {
  const h = harness().down(W, 600).move(40); // forward side, dragged right
  assert.equal(h.s.d, 0);
  h.up(900);
  assert.equal(h.settle.complete, false);
  assert.equal(h.finishSettle(), 0);
});

check('direction comes from where the finger lands, not from early jitter', () => {
  const h = harness().down(W - 3, 600);
  h.move(4); // tiny rightward jitter below the activation distance
  assert.equal(h.mounted, 0);
  h.move(-30);
  assert.equal(h.s.dir, 1);
  near(h.s.d, 30, 'progress from the final position');
});

check('first and last page: nothing to grab on the missing side, the other side still works', () => {
  const first = harness({ canPrev: false });
  first.down(0, 600).move(80);
  assert.equal(first.mounted, 0);
  assert.equal(first.s.busy, g.IDLE);
  assert.equal(first.up(0).settle, null);
  const fwd = harness({ canPrev: false }).down(W, 600).move(-0.5 * W).up(0);
  assert.equal(fwd.finishSettle(), 1);

  const last = harness({ canNext: false });
  last.down(W, 600).move(-80);
  assert.equal(last.mounted, 0);
  const back = harness({ canNext: false }).down(0, 600).move(0.5 * W).up(0);
  assert.equal(back.finishSettle(), -1);

  assert.equal(g.tapTurn(g.initialState(H), 1, { ...last.cfg }).play, null);
  assert.equal(g.tapTurn(g.initialState(H), -1, { ...first.cfg }).play, null);
});

check('no overlapping turns: touches and taps are ignored while a turn settles; the next turn works after', () => {
  const h = harness().down(W, 600).move(-0.5 * W).up(0);
  assert.equal(h.s.busy, g.SETTLING);
  const settling = h.s;
  // a second finger-down mid-settle must not arm, activate or disturb the running turn
  h.s = g.begin(h.s, 0, 600, h.cfg);
  assert.equal(h.s.armed, false);
  const r = g.activate(h.s, h.cfg);
  assert.equal(r.mount, false);
  assert.equal(g.move(r.s, 100, 0, h.cfg).d, settling.d);
  assert.equal(g.release(r.s, 500, h.cfg).settle, null);
  assert.equal(g.tapTurn(r.s, 1, h.cfg).play, null);
  assert.equal(g.tapTurn(r.s, -1, h.cfg).play, null);
  // the turn finishes exactly once, then a new one starts cleanly
  assert.equal(h.finishSettle(), 1);
  const next = h.down(0, 600).move(0.5 * W).up(0);
  assert.equal(next.mounted, 2);
  assert.equal(next.finishSettle(), -1);
  assert.deepEqual(next.commits, [1, -1]);
});

check('the end of a turn leaves the curl as it was (no one-frame flash of the old page) and the next one resets it', () => {
  const h = harness().down(W, 600).move(-0.5 * W).up(0);
  const endD = h.s.d;
  h.finishSettle();
  assert.equal(h.s.busy, g.IDLE);
  assert.equal(h.s.d, endD);
  assert.equal(h.s.dir, 1);
  h.down(W, 600).move(-ACTIVE_X);
  near(h.s.d, ACTIVE_X, 'new turn starts from zero');
});

check('tap turn: claims the machine from the bottom corner and plays a full turn; ignored while busy', () => {
  const r = g.tapTurn(g.initialState(H), 1, harness().cfg);
  assert.equal(r.s.busy, g.SETTLING);
  assert.equal(r.s.dir, 1);
  assert.equal(r.s.corner, H);
  assert.equal(r.play.target, 2 * W);
  assert.equal(g.tapTurn(r.s, 1, harness().cfg).play, null);
  assert.equal(g.done(r.s, true).delta, 1);
  const back = g.tapTurn(g.initialState(H), -1, harness().cfg);
  assert.equal(g.done(back.s, true).delta, -1);
});

check('a tap (no movement) never becomes a drag or a turn', () => {
  const h = harness().down(W - 5, 300);
  h.move(3, 4);
  h.move(0, 0);
  assert.equal(h.mounted, 0);
  assert.equal(h.s.busy, g.IDLE);
  assert.equal(h.up(0).settle, null);
});

check('vertical movement lifts the grabbed corner (bottom or top half) and is bounded', () => {
  const bottom = harness().down(W, 600).move(-100, -80);
  assert.equal(bottom.s.corner, H);
  assert.equal(bottom.s.inward, 80);
  const top = harness().down(W, 40).move(-100, 80);
  assert.equal(top.s.corner, 0);
  assert.equal(top.s.inward, 80);
  assert.equal(harness().down(W, 600).move(-100, -1e5).s.inward, 0.3 * H);
});

check('travel/progress helpers are inverses and clamp', () => {
  for (const dir of [1, -1]) {
    for (const f of [0, 10, 100, 300]) near(g.travelForProgress(dir, g.progressForTravel(dir, f, W)), f, 'round trip');
    assert.equal(g.progressForTravel(dir, 1e6, W), 2 * W);
    assert.equal(g.progressForTravel(dir, -5, W), 0);
  }
});

console.log(`\n${passed} passed`);
