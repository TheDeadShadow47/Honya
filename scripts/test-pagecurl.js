// Numeric checks for the page-curl geometry (lib/pageCurl.js).
// Applies React Native's layout/transform rules by hand (absolute left/top, transformOrigin top-left,
// rotate in radians) to the returned numbers and verifies where the page, the back of the sheet and
// the fold land on screen. Does not test rendering.
//
// Run with: node scripts/test-pagecurl.js

import assert from 'node:assert/strict';
import { computeCurl, curlState, tipForDrag, shouldComplete, shadowFade, ROLL_MAX } from '../lib/pageCurl.js';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const pt = (p, q, msg) => {
  near(p[0], q[0], `${msg} x`);
  near(p[1], q[1], `${msg} y`);
};
const rot = (a, x, y) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** Screen position of local point q of an element placed in the clip square (left/top/rotate about top-left). */
function toScreen(c, el, qx, qy) {
  const [rx, ry] = rot(el.rotate, qx, qy);
  const bx = el.left + rx; // coordinates inside the clip square
  const by = el.top + ry;
  const bcx = c.clip.left + c.clip.size / 2;
  const bcy = c.clip.top + c.clip.size / 2;
  const [sx, sy] = rot(c.clip.rotate, bx - c.clip.size / 2, by - c.clip.size / 2);
  return [bcx + sx, bcy + sy];
}
const reflect = (c, x, y) => {
  const k = 2 * ((x - c.mx) * c.nx + (y - c.my) * c.ny);
  return [x - k * c.nx, y - k * c.ny];
};

const W = 360;
const H = 640;

const cases = [];
for (const rtl of [false, true]) {
  for (const dir of ['next', 'prev']) {
    for (const cornerY of [0, H]) {
      for (const d of [20, 0.25 * W, 0.6 * W, W, 1.4 * W]) {
        for (const inward of [0, 60, 150]) cases.push({ rtl, dir, cornerY, d, inward });
      }
    }
  }
}

check('no curl until the tip leaves the corner', () => {
  assert.equal(computeCurl(W, H, W, H, W, H).active, false);
  assert.equal(curlState('next', 0, 0, H, false, W, H).active, false);
  assert.equal(curlState('next', 0, 0, H, true, W, H).active, false);
});

check('the page is drawn upright and unmoved: its corners land at their own screen positions', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    for (const [qx, qy] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 3]]) pt(toScreen(c, c.page, qx, qy), [qx, qy], `page ${JSON.stringify(k)}`);
  }
});

check('the back of the sheet is the page reflected across the fold', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    // local flap point q is shown at R(sigma(q)), sigma mirroring horizontally
    for (const [qx, qy] of [[0, 0], [W, 0], [0, H], [W, H], [W / 3, H / 2]]) {
      pt(toScreen(c, c.flap, qx, qy), reflect(c, W - qx, qy), `flap ${JSON.stringify(k)}`);
    }
  }
});

check('the dragged tip is the reflection of the page corner (the corner really follows the finger)', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    const [px, py] = tipForDrag(k.dir, k.d, k.inward, k.cornerY, W, H);
    const tip = k.rtl ? [W - px, py] : [px, py];
    const corner = k.rtl ? [0, k.cornerY] : [W, k.cornerY];
    pt(reflect(c, corner[0], corner[1]), tip, `corner->tip ${JSON.stringify(k)}`);
    // the corner of the flap rectangle that corresponds to the page corner sits on the tip
    const q = k.rtl ? [W, k.cornerY] : [0, k.cornerY]; // sigma(q) = corner
    pt(toScreen(c, c.flap, q[0], q[1]), tip, `flap corner ${JSON.stringify(k)}`);
  }
});

check('the fold line is the perpendicular bisector: midpoint on the line, equidistant from tip and corner', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    const [px, py] = tipForDrag(k.dir, k.d, k.inward, k.cornerY, W, H);
    const tip = k.rtl ? [W - px, py] : [px, py];
    const corner = k.rtl ? [0, k.cornerY] : [W, k.cornerY];
    near(Math.hypot(tip[0] - c.mx, tip[1] - c.my), Math.hypot(corner[0] - c.mx, corner[1] - c.my), 'equidistant');
    near((tip[0] - c.mx) * -c.nx + (tip[1] - c.my) * -c.ny, c.dist / 2, 'tip is dist/2 behind the fold');
    near(Math.hypot(c.nx, c.ny), 1, 'unit normal');
  }
});

check('the clip square covers the page side of the fold and nothing beyond it', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    // the square's right edge centre is on the fold; its local +x axis is the fold normal
    const edge = rot(c.clip.rotate, c.clip.size / 2, 0);
    const centre = [c.clip.left + c.clip.size / 2, c.clip.top + c.clip.size / 2];
    const onFold = [centre[0] + edge[0], centre[1] + edge[1]];
    near((onFold[0] - c.mx) * c.nx + (onFold[1] - c.my) * c.ny, -c.delta, 'edge sits delta before the fold');
    // every page corner on the corner's side of the fold is clipped; those on the tip's side are kept
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const u = (x - c.mx) * c.nx + (y - c.my) * c.ny;
      const inBox = u <= -c.delta + 1e-9;
      const local = rot(-c.clip.rotate, x - centre[0], y - centre[1]);
      assert.equal(local[0] <= c.clip.size / 2 + 1e-6, inBox, `corner (${x},${y}) ${JSON.stringify(k)}`);
      assert.ok(Math.abs(local[1]) <= c.clip.size / 2, 'within the square vertically');
    }
  }
});

check('the clip square is large enough to hold the whole page from any fold angle', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    const centre = [c.clip.left + c.clip.size / 2, c.clip.top + c.clip.size / 2];
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const u = (x - c.mx) * c.nx + (y - c.my) * c.ny;
      if (u > -c.delta) continue;
      const local = rot(-c.clip.rotate, x - centre[0], y - centre[1]);
      assert.ok(Math.abs(local[0]) <= c.clip.size / 2 && Math.abs(local[1]) <= c.clip.size / 2, `covered ${JSON.stringify(k)}`);
    }
  }
});

check('forward and backward turns are mirror-consistent: next at d == prev at 2W-d is the same fold line', () => {
  for (const d of [0.3 * W, W, 1.5 * W]) {
    const a = curlState('next', d, 0, H, false, W, H);
    const b = curlState('prev', 2 * W - d, 0, H, false, W, H);
    // same page position of the tip in x, so identical fold geometry
    near(a.mx, b.mx, 'mx');
    near(a.nx, b.nx, 'nx');
  }
});

check('RTL mirrors LTR: fold positions reflect across the page centre line', () => {
  for (const dir of ['next', 'prev']) {
    for (const d of [0.2 * W, 0.7 * W, 1.3 * W]) {
      const l = curlState(dir, d, 90, H, false, W, H);
      const r = curlState(dir, d, 90, H, true, W, H);
      near(r.mx, W - l.mx, 'mx');
      near(r.my, l.my, 'my');
      near(r.nx, -l.nx, 'nx');
      near(r.ny, l.ny, 'ny');
    }
  }
});

check('a completed turn leaves the flap off screen; a cancelled one leaves no curl', () => {
  // forward, LTR, fully turned: fold at x = 0, flap entirely at x <= 0
  const done = curlState('next', 2 * W, 0, H, false, W, H);
  near(done.mx, 0, 'fold at the left edge');
  for (const [qx, qy] of [[0, 0], [W, 0], [0, H], [W, H]]) assert.ok(toScreen(done, done.flap, qx, qy)[0] <= 1e-6, 'flap off screen');
  // backward, LTR, fully restored: the tip is back on the corner, so there is no curl left
  assert.equal(curlState('prev', 2 * W, 0, H, false, W, H).active, false);
  // backward, LTR, just started: the fold hugs the left edge
  near(curlState('prev', 0, 0, H, false, W, H).mx, 0, 'fold at the left edge');
  assert.ok(curlState('prev', 0.05 * W, 0, H, false, W, H).mx < 0.06 * W);
  // RTL forward, fully turned: fold at x = W, flap at x >= W
  const rdone = curlState('next', 2 * W, 0, H, true, W, H);
  near(rdone.mx, W, 'rtl fold at the right edge');
  for (const [qx, qy] of [[0, 0], [W, 0], [0, H], [W, H]]) assert.ok(toScreen(rdone, rdone.flap, qx, qy)[0] >= W - 1e-6, 'rtl flap off screen');
});

check('the fold stays well-defined at awkward inputs (no NaN)', () => {
  for (const d of [0.001, 0.4, 2 * W, 5 * W, -50]) {
    for (const inward of [-10, 0, 1e5]) {
      const c = curlState('next', d, inward, H, false, W, H);
      if (!c.active) continue;
      for (const v of [c.clip.left, c.clip.top, c.page.left, c.flap.left, c.flap.rotate, c.shadow.left, c.arch.left, c.arch.width, c.r]) assert.ok(Number.isFinite(v));
    }
  }
});

check('drag mapping: tip starts on the corner, moves with the finger, and the lift is bounded', () => {
  assert.deepEqual(tipForDrag('next', 0, 0, H, W, H), [W, H]);
  assert.deepEqual(tipForDrag('prev', 0, 0, H, W, H), [-W, H]);
  assert.deepEqual(tipForDrag('next', 100, 0, 0, W, H), [W - 100, 0]);
  assert.equal(tipForDrag('next', 100, 1e5, H, W, H)[1], H - 0.3 * H);
  assert.equal(tipForDrag('next', 100, 1e5, 0, W, H)[1], 0.3 * H);
  assert.equal(tipForDrag('next', 1e6, 0, H, W, H)[0], -W);
});

check('release rule: far drags and quick flicks complete, short or reversed ones cancel', () => {
  assert.equal(shouldComplete(0.5 * W, 0, W), true);
  assert.equal(shouldComplete(0.39 * W, 0, W), false);
  assert.equal(shouldComplete(0.1 * W, 800, W), true);
  assert.equal(shouldComplete(0.01 * W, 800, W), false); // a twitch is not a flick
  assert.equal(shouldComplete(0.7 * W, -900, W), false); // flicked back
});

check('the rolled edge: arch sits between the flat underside and the page beneath, sized by the drag', () => {
  for (const k of cases) {
    const c = curlState(k.dir, k.d, k.inward, k.cornerY, k.rtl, W, H);
    if (!c.active) continue;
    assert.ok(c.r >= 0 && c.r <= ROLL_MAX * W + 1e-9, 'radius bounded');
    assert.ok(c.delta < c.dist / 2 + 1e-9, 'the flat underside keeps a non-negative length');
    // arch centre, projected on the fold normal from the fold: -delta + r/2, width r
    const ax = c.arch.left + c.arch.width / 2;
    const ay = c.arch.top + c.arch.height / 2;
    near((ax - c.mx) * c.nx + (ay - c.my) * c.ny, -c.delta + c.r / 2, 'arch centre');
    // shadow starts where the arch ends
    const sx = c.shadow.left + c.shadow.width / 2;
    const sy = c.shadow.top + c.shadow.height / 2;
    near((sx - c.mx) * c.nx + (sy - c.my) * c.ny - c.shadow.width / 2, -c.delta + c.r, 'shadow starts at the roll edge');
  }
  assert.ok(curlState('next', 2, 0, H, false, W, H).r < 1, 'roll vanishes at the start of a turn');
  near(curlState('next', W, 0, H, false, W, H).r, ROLL_MAX * W, 'roll reaches full radius mid-turn');
});

check('shadow fades out as the curl leaves the screen and in as it enters', () => {
  assert.equal(shadowFade('next', 0, W), 1);
  assert.equal(shadowFade('next', 2 * W, W), 0);
  assert.equal(shadowFade('prev', 0, W), 0);
  assert.equal(shadowFade('prev', W, W), 1);
  assert.equal(shadowFade('prev', 2 * W, W), 1);
  assert.ok(shadowFade('next', 1.9 * W, W) < 0.5);
});

console.log(`\n${passed} passed (${cases.length} drag states per property)`);
