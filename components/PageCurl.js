import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { abort, activate, begin, done, move, release, tapTurn } from '../lib/curlGesture';
import { curlState, shadowFade } from '../lib/pageCurl';

const ACTIVE_X = 10; // horizontal travel (px) before a touch becomes a page drag; taps never move that far
const GHOST_OPACITY = 0.09; // the turning page's text, faintly visible through the back of the sheet
// Cylinder shading across the rolled band, flat underside side first (black overlay opacity per sixth).
const ROLL_SHADE = [0, 0.03, 0.09, 0.17, 0.27, 0.38];
const ROLL_HIGHLIGHT = [0.12, 0.28, 0.1]; // [from, to (fraction of the band), white overlay opacity]
const CAST_SHADE = [
  [1, 0.12],
  [0.62, 0.08],
  [0.3, 0.07],
];

/**
 * Paper page-turn for the paged reader. The static page is a plain view; a turn mounts two page
 * layers (the page being lifted and the page revealed under it) and drives a corner-fold curl from
 * shared values on the UI thread, so nothing re-renders while a finger is moving. React state is
 * touched only when a turn starts and when it ends.
 *
 * All gesture decisions live in `lib/curlGesture.js` (pure, unit-tested); the worklets below only
 * copy state between shared values and that module. The Pan gesture is created once and reads its
 * configuration (page size, direction, which neighbours exist) from shared values, so a parent
 * re-render in the middle of a drag (for example hiding the toolbar) can never replace or cancel it.
 *
 * Imperative handle: `turn(delta)` plays the same animation for taps (+1 next / -1 previous, in
 * reading order). Drags and taps end in `onCommit(delta)` (delta 0 = cancelled turn).
 */
const PageCurl = forwardRef(function PageCurl(
  { width, height, rtl, bg, fg, canNext, canPrev, renderPage, renderEdge, onCommit, onDragStart },
  ref,
) {
  const [turn, setTurn] = useState(null); // { dir: 'next' | 'prev', auto: boolean, key }
  const keyRef = useRef(0);
  const playRef = useRef(null); // the tap turn waiting for its layers to mount
  const cb = useRef({ onCommit, onDragStart });
  useEffect(() => {
    cb.current = { onCommit, onDragStart };
  }, [onCommit, onDragStart]);

  // Gesture state (UI thread). Mirrors the plain object used by lib/curlGesture.js.
  const busy = useSharedValue(0);
  const dirSv = useSharedValue(0); // 1 next, -1 prev; kept after a turn ends until the next one starts
  const dSv = useSharedValue(0);
  const inwardSv = useSharedValue(0);
  const cornerSv = useSharedValue(height);
  const armed = useSharedValue(false);
  const pendingDir = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Configuration as shared values, kept current by the effect below.
  const wSv = useSharedValue(width);
  const hSv = useSharedValue(height);
  const rtlSv = useSharedValue(rtl);
  const nextSv = useSharedValue(canNext);
  const prevSv = useSharedValue(canPrev);
  useEffect(() => {
    wSv.value = width;
    hSv.value = height;
    rtlSv.value = rtl;
    nextSv.value = canNext;
    prevSv.value = canPrev;
  }, [width, height, rtl, canNext, canPrev, wSv, hSv, rtlSv, nextSv, prevSv]);

  const readState = () => {
    'worklet';
    return {
      busy: busy.value,
      dir: dirSv.value,
      d: dSv.value,
      inward: inwardSv.value,
      corner: cornerSv.value,
      armed: armed.value,
      pendingDir: pendingDir.value,
      startX: startX.value,
      startY: startY.value,
    };
  };
  const writeState = (st) => {
    'worklet';
    busy.value = st.busy;
    dirSv.value = st.dir;
    // While a turn settles, `d` belongs to the running animation: writing it (even to the same value)
    // would cancel that animation, e.g. when a new touch begins mid-settle.
    if (st.busy !== 2) dSv.value = st.d;
    inwardSv.value = st.inward;
    cornerSv.value = st.corner;
    armed.value = st.armed;
    pendingDir.value = st.pendingDir;
    startX.value = st.startX;
    startY.value = st.startY;
  };
  const readCfg = () => {
    'worklet';
    return { W: wSv.value, H: hSv.value, rtl: rtlSv.value, canNext: nextSv.value, canPrev: prevSv.value };
  };

  const mount = useCallback((dir, auto) => {
    keyRef.current += 1;
    setTurn({ dir, auto, key: keyRef.current });
  }, []);
  const mountDrag = useCallback((dir) => mount(dir, false), [mount]);
  const dragStarted = useCallback(() => cb.current.onDragStart?.(), []);
  const commit = useCallback((delta) => {
    setTurn(null);
    cb.current.onCommit?.(delta);
  }, []);

  // Runs a settle animation (release or tap) and, when it ends, frees the machine and reports the result.
  const runSettle = (settle, easing) => {
    'worklet';
    dSv.value = withTiming(settle.target, { duration: settle.duration, easing }, (finished) => {
      'worklet';
      if (!finished) return;
      const r = done(readState(), settle.complete);
      writeState(r.s);
      scheduleOnRN(commit, r.delta);
    });
  };

  // Programmatic (tap) turn: claim the machine, mount the layers, then animate once they exist.
  useImperativeHandle(
    ref,
    () => ({
      turn: (delta) => {
        const r = tapTurn(readState(), delta, { W: width, H: height, rtl, canNext, canPrev });
        if (!r.play) return;
        dSv.value = 0; // the previous turn left d at its end value; the tap turn starts from the corner
        writeState(r.s);
        playRef.current = { target: r.play.target, duration: r.play.duration, complete: true };
        mount(r.s.dir === 1 ? 'next' : 'prev', true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, rtl, canNext, canPrev, mount],
  );

  useEffect(() => {
    if (!turn?.auto || !playRef.current) return;
    const play = playRef.current;
    playRef.current = null;
    runSettle(play, Easing.inOut(Easing.quad));
    return () => cancelAnimation(dSv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Only horizontal travel activates it: a tap, or a purely vertical touch, never becomes a turn.
        .activeOffsetX([-ACTIVE_X, ACTIVE_X])
        .onBegin((e) => {
          'worklet';
          writeState(begin(readState(), e.x, e.y, readCfg()));
        })
        .onStart(() => {
          'worklet';
          const r = activate(readState(), readCfg());
          writeState(r.s);
          if (r.mount) {
            scheduleOnRN(mountDrag, r.s.dir === 1 ? 'next' : 'prev');
            scheduleOnRN(dragStarted);
          }
        })
        .onUpdate((e) => {
          'worklet';
          writeState(move(readState(), e.translationX, e.translationY, readCfg()));
        })
        .onEnd((e) => {
          'worklet';
          const r = release(readState(), e.velocityX, readCfg());
          if (!r.settle) return;
          writeState(r.s);
          runSettle(r.settle, Easing.out(Easing.cubic));
        })
        .onFinalize((_e, success) => {
          'worklet';
          if (success) return;
          // Cancelled by the system after activation (no release event): put the page back.
          const r = abort(readState(), readCfg());
          if (!r.settle) return;
          writeState(r.s);
          runSettle(r.settle, Easing.out(Easing.cubic));
        }),
    // Everything it needs is read from shared values or stable callbacks, so it is built exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const curl = useDerivedValue(() => {
    const dir = dirSv.value === -1 ? 'prev' : 'next';
    return curlState(dir, dSv.value, inwardSv.value, cornerSv.value, rtl, width, height);
  });

  const clipStyle = useAnimatedStyle(() => {
    const c = curl.value;
    if (!c.active) return { left: 0, top: 0, width, height, transform: [{ rotate: '0rad' }] };
    return { left: c.clip.left, top: c.clip.top, width: c.clip.size, height: c.clip.size, transform: [{ rotate: `${c.clip.rotate}rad` }] };
  });
  const pageStyle = useAnimatedStyle(() => {
    const c = curl.value;
    if (!c.active) return { left: 0, top: 0, transform: [{ rotate: '0rad' }] };
    return { left: c.page.left, top: c.page.top, transform: [{ rotate: `${c.page.rotate}rad` }] };
  });
  const flapStyle = useAnimatedStyle(() => {
    const c = curl.value;
    if (!c.active) return { opacity: 0, left: 0, top: 0, transform: [{ rotate: '0rad' }] };
    return { opacity: 1, left: c.flap.left, top: c.flap.top, transform: [{ rotate: `${c.flap.rotate}rad` }] };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const c = curl.value;
    if (!c.active) return { opacity: 0 };
    const s = c.shadow;
    const fade = shadowFade(dirSv.value === -1 ? 'prev' : 'next', dSv.value, width);
    return { opacity: fade, left: s.left, top: s.top, width: s.width, height: s.height, transform: [{ rotate: `${s.rotate}rad` }] };
  });
  const archStyle = useAnimatedStyle(() => {
    const c = curl.value;
    if (!c.active) return { opacity: 0 };
    const a = c.arch;
    return { opacity: 1, left: a.left, top: a.top, width: a.width, height: a.height, transform: [{ rotate: `${a.rotate}rad` }] };
  });

  const layer = (el) => <View style={{ width, height, backgroundColor: bg, overflow: 'hidden' }}>{el}</View>;

  // The lifted page and the page revealed beneath it. At a chapter boundary the missing page is the edge cell.
  let top = null;
  let ghost = null; // the turning page again, mirrored, for the show-through on its back
  let under = null;
  if (turn) {
    if (turn.dir === 'next') {
      top = layer(renderPage(0));
      ghost = top;
      under = layer(renderPage(1) ?? renderEdge('next'));
    } else {
      const prevPage = renderPage(-1);
      top = layer(prevPage ?? renderEdge('prev'));
      ghost = prevPage ? top : null;
      under = layer(renderPage(0));
    }
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height, backgroundColor: bg, overflow: 'hidden' }} collapsable={false}>
        {turn ? (
          <>
            <View style={StyleSheet.absoluteFill}>{under}</View>
            <Animated.View pointerEvents="none" style={[styles.abs, shadowStyle]}>
              {CAST_SHADE.map(([f, a], i) => (
                <View key={i} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${f * 100}%`, backgroundColor: '#000', opacity: a }} />
              ))}
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.abs, { overflow: 'hidden' }, clipStyle]}>
              <Animated.View style={[styles.abs, { width, height, transformOrigin: 'top left' }, pageStyle]}>{top}</Animated.View>
              <Animated.View style={[styles.abs, { width, height, backgroundColor: bg, overflow: 'hidden', transformOrigin: 'top left' }, flapStyle]}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: fg, opacity: 0.07 }]} />
                {ghost ? <View style={{ position: 'absolute', left: 0, top: 0, opacity: GHOST_OPACITY, transform: [{ scaleX: -1 }] }}>{ghost}</View> : null}
              </Animated.View>
            </Animated.View>
            {/* The rolled edge sits outside the clip: it joins the flat underside to the page beneath. */}
            <Animated.View pointerEvents="none" style={[styles.abs, { backgroundColor: bg, overflow: 'hidden' }, archStyle]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: fg, opacity: 0.07 }]} />
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${ROLL_HIGHLIGHT[0] * 100}%`,
                  width: `${(ROLL_HIGHLIGHT[1] - ROLL_HIGHLIGHT[0]) * 100}%`,
                  backgroundColor: '#fff',
                  opacity: ROLL_HIGHLIGHT[2],
                }}
              />
              {ROLL_SHADE.map((a, i) => (
                <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i * 100) / ROLL_SHADE.length}%`, width: `${100 / ROLL_SHADE.length + 1}%`, backgroundColor: '#000', opacity: a }} />
              ))}
            </Animated.View>
          </>
        ) : (
          renderPage(0)
        )}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({ abs: { position: 'absolute' } });

export default PageCurl;
