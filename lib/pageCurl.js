// Corner-fold curl: the fold is the perpendicular bisector of tip P and corner C. The page is
// clipped to P's side of it; the reflected sheet (its back) is drawn on that side too.
//
// A flat fold looks like folded card, so the underside stops pi*r/2 short of the fold and a shaded
// band of width r joins it to the page beneath. The flap is still an exact reflection, so the corner
// stays under the finger. r is zero at both ends of the drag so the roll never pops in or out.
//
// The clip is a rotated square View with overflow hidden; the page and flap are counter-rotated
// children. Values are plain RN style numbers so these run in Reanimated worklets. Canonical
// direction is LTR; RTL mirrors the tip and corner in `curlState`.

export const ROLL_MAX = 0.07; // roll radius as a fraction of the page width
export const SHADOW_MAX = 36;

function rot(a, x, y) {
  'worklet';
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/** Returns `{ active: false }` until the tip leaves the corner. */
export function computeCurl(px, py, cx, cy, W, H) {
  'worklet';
  const dx = cx - px;
  const dy = cy - py;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.5) return { active: false };

  const nx = dx / dist; // unit normal of the fold, pointing from P towards C
  const ny = dy / dist;
  const mx = (px + cx) / 2;
  const my = (py + cy) / 2;
  const alpha = Math.atan2(ny, nx);
  const L = 2 * Math.sqrt(W * W + H * H); // big enough that the square always covers the page

  // Roll radius and how far the flat underside stops short of the fold.
  const r = Math.min(ROLL_MAX * W, dist * 0.18);
  const delta = (Math.PI * r) / 2;
  const ex = mx - nx * delta; // where the flat underside meets the roll (the clip edge)
  const ey = my - ny * delta;

  // Clip square: its right edge passes through (ex, ey); rotated about its own centre.
  const bcx = ex - (nx * L) / 2;
  const bcy = ey - (ny * L) / 2;
  const clip = { left: bcx - L / 2, top: bcy - L / 2, size: L, rotate: alpha };

  // Page, upright on screen, expressed in the clip square's frame.
  const [pbx, pby] = rot(-alpha, 0 - bcx, 0 - bcy);
  const page = { left: L / 2 + pbx, top: L / 2 + pby, rotate: -alpha };

  // Back of the sheet. R(x) = x - 2((x-M).n)n reflects across the fold. A blank rectangle is
  // symmetric, so the reflected rectangle can be drawn as a proper rotation of a plain W x H view:
  // local point q is shown at R(sigma(q)) where sigma mirrors horizontally, giving rotation phi.
  const a00 = 1 - 2 * nx * nx;
  const a10 = -2 * nx * ny;
  // A = Rl * diag(-1, 1)
  const r00 = -a00;
  const r10 = -a10;
  const phi = Math.atan2(r10, r00);
  const dotMn = mx * nx + my * ny;
  const tx = a00 * W + 2 * dotMn * nx; // R((W, 0))
  const ty = a10 * W + 2 * dotMn * ny;
  const [fbx, fby] = rot(-alpha, tx - bcx, ty - bcy);
  const flap = { left: L / 2 + fbx, top: L / 2 + fby, rotate: phi - alpha };

  // The rolled band, from the flat underside's end to the roll's far side (centre-origin rect, like the shadow).
  const acx = ex + (nx * r) / 2;
  const acy = ey + (ny * r) / 2;
  const arch = { left: acx - r / 2, top: acy - L / 2, width: r, height: L, rotate: alpha };

  // Soft shadow cast on the page underneath, just beyond the roll (in the uncovered half-plane).
  const sw = Math.min(SHADOW_MAX, dist * 0.25);
  const sx = ex + nx * r + (nx * sw) / 2;
  const sy = ey + ny * r + (ny * sw) / 2;
  const shadow = { left: sx - sw / 2, top: sy - L / 2, width: sw, height: L, rotate: alpha };

  return { active: true, nx, ny, mx, my, alpha, L, dist, r, delta, clip, page, flap, arch, shadow };
}

export function tipForDrag(dir, d, inward, cornerY, W, H) {
  'worklet';
  const dd = Math.max(0, Math.min(2 * W, d));
  const lift = Math.max(0, Math.min(0.3 * H, inward));
  const py = cornerY >= H / 2 ? cornerY - lift : cornerY + lift;
  // forward: the current page peels off towards -x; backward: the previous page returns from -x.
  const px = dir === 'next' ? W - dd : -W + dd;
  return [px, py];
}

// RTL mirrors the tip and corner; computeCurl then returns screen coordinates directly.
export function curlState(dir, d, inward, cornerY, rtl, W, H) {
  'worklet';
  const [px, py] = tipForDrag(dir, d, inward, cornerY, W, H);
  if (!rtl) return computeCurl(px, py, W, cornerY, W, H);
  return computeCurl(W - px, py, 0, cornerY, W, H);
}

// Fades the shadow at the screen edge, where it would otherwise linger for a frame after unmount.
export function shadowFade(dir, d, W) {
  'worklet';
  const p = Math.max(0, Math.min(1, d / (2 * W)));
  const q = dir === 'next' ? 1 - p : p;
  return Math.max(0, Math.min(1, q / 0.18));
}

export function shouldComplete(d, velocity, W) {
  'worklet';
  if (velocity > 520 && d > 0.04 * W) return true; // a quick flick in the turning direction
  if (velocity < -520) return false; // flicked back
  return d > 0.4 * W;
}
