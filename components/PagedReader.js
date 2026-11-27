import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useI18n } from '../hooks/useI18n';
import { paginate, pageForOffset, ratioForPage } from '../lib/paginate';
import { useStore } from '../store/useStore';
import PageCurl from './PageCurl';

// Chrome reserved around the text so every page has the same capacity.
const HEADER_EXTRA = 28; // mirrors the scrolling reader's `insets.top + 28` top padding
const FOOTER_EXTRA = 34;
const V_PAD = 8;
const TAP_SLOP = 10;
const TAP_MAX_MS = 350;
const EDGE_ZONE = 0.3; // outer 30% of the width on each side turns pages; the middle toggles the chrome
const REMEASURE_DEBOUNCE_MS = 250;

const PageCell = memo(function PageCell({ slice, width, height, pad, fontSize, lineHeight, rtl, fg }) {
  return (
    <View style={{ width, height, paddingHorizontal: pad, paddingVertical: V_PAD, overflow: 'hidden' }}>
      <Text
        style={{
          color: fg,
          fontSize,
          lineHeight: fontSize * lineHeight,
          writingDirection: rtl ? 'rtl' : 'ltr',
          textAlign: rtl ? 'right' : 'left',
        }}
      >
        {slice}
      </Text>
    </View>
  );
});

function EdgeCell({ width, height, fg, label }) {
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={fg} />
      <Text style={{ color: fg, opacity: 0.6, marginTop: 12, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduce(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * Text is laid out once off-screen with the live typography, then grouped into whole-line pages so
 * breaks reflow with font size, padding and viewport changes. RTL reverses the physical page order.
 * The optional curl replaces the FlatList but shares page state, pagination and progress with it.
 */
function PagedReader({
  text,
  rtl,
  palette,
  fontSize,
  lineHeight,
  horizontalPadding,
  chapterName,
  initialRatio = 0,
  startAtEnd = false,
  hasPrev = false,
  hasNext = false,
  topInset = 0,
  bottomInset = 0,
  chromeOpen = false,
  onPageChange,
  onEdge,
  onTap,
  onDragStart,
}) {
  const { t } = useI18n();
  const listRef = useRef(null);
  const curlRef = useRef(null);
  const reduceMotion = useReduceMotion();
  const curlPref = useStore((s) => s.prefs.pageTurnAnimation === true);
  const [size, setSize] = useState(null);
  const [measureKey, setMeasureKey] = useState(null);
  const [result, setResult] = useState(null); // { pages, key }
  const [current, setCurrent] = useState(0);

  const currentRef = useRef(0);
  const measuredKeyRef = useRef(null);
  const hasKeyRef = useRef(false);
  const touchRef = useRef(null);
  // Character offset we want to keep on screen across re-pagination (null until first layout).
  const anchorRef = useRef(
    startAtEnd
      ? Number.POSITIVE_INFINITY
      : initialRatio > 0.02 && initialRatio < 0.99
        ? Math.floor(initialRatio * text.length)
        : 0,
  );

  const headerH = topInset + HEADER_EXTRA;
  const footerH = bottomInset + FOOTER_EXTRA;
  const width = size?.w ?? 0;
  const areaH = size ? Math.max(size.h - headerH - footerH, 0) : 0;
  const textH = Math.max(areaH - V_PAD * 2, 0);
  const textW = Math.max(width - horizontalPadding * 2, 0);

  const signature = size
    ? [text.length, fontSize, lineHeight, horizontalPadding, size.w, size.h, rtl ? 1 : 0, topInset, bottomInset].join('|')
    : null;

  // First layout paginates immediately; later typography/size changes are debounced so dragging a slider doesn't re-measure per tick.
  useEffect(() => {
    if (!signature) return undefined;
    if (!hasKeyRef.current) {
      hasKeyRef.current = true;
      setMeasureKey(signature);
      return undefined;
    }
    const id = setTimeout(() => setMeasureKey(signature), REMEASURE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [signature]);

  const onMeasured = useCallback(
    (e) => {
      if (measuredKeyRef.current === measureKey) return; // onTextLayout can fire more than once per layout
      measuredKeyRef.current = measureKey;
      const lines = e?.nativeEvent?.lines ?? [];
      const pages = paginate(text, lines, textH);
      const idx = pageForOffset(pages, anchorRef.current);
      currentRef.current = idx;
      setCurrent(idx);
      setResult({ pages, key: measureKey });
    },
    [measureKey, text, textH],
  );

  const pages = result?.pages ?? null;
  const count = pages?.length ?? 0;

  // Keep the anchor (the first character of the visible page) current so a re-flow lands on the same text.
  useEffect(() => {
    if (!pages) return;
    const p = pages[Math.min(current, pages.length - 1)];
    if (p) anchorRef.current = p.start;
    onPageChange?.({
      index: current,
      count: pages.length,
      ratio: ratioForPage(pages, text.length, current),
      isLast: current >= pages.length - 1,
    });
  }, [pages, current]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    if (!pages) return [];
    const list = [];
    if (hasPrev) list.push({ k: 'prev' });
    for (let i = 0; i < pages.length; i += 1) list.push({ k: 'page', i });
    if (hasNext) list.push({ k: 'next' });
    return rtl ? list.reverse() : list;
  }, [pages, hasPrev, hasNext, rtl]);

  const indexOfPage = useCallback(
    (i) => cells.findIndex((c) => c.k === 'page' && c.i === i),
    [cells],
  );

  // Move the logical page by `delta` after a curl turn has already played; past either end hands over to the chapter.
  const commitLogical = useCallback(
    (delta) => {
      if (!pages || !delta) return;
      const target = currentRef.current + delta;
      if (target < 0) {
        if (hasPrev) onEdge?.('prev');
        return;
      }
      if (target >= pages.length) {
        if (hasNext) onEdge?.('next');
        return;
      }
      currentRef.current = target;
      setCurrent(target);
    },
    [pages, hasPrev, hasNext, onEdge],
  );

  const useCurl = curlPref && !reduceMotion && !!pages;

  const goLogical = useCallback(
    (delta) => {
      if (!pages) return;
      if (useCurl) {
        curlRef.current?.turn(delta);
        return;
      }
      const target = currentRef.current + delta;
      if (target < 0) {
        if (hasPrev) onEdge?.('prev');
        return;
      }
      if (target >= pages.length) {
        if (hasNext) onEdge?.('next');
        return;
      }
      currentRef.current = target;
      setCurrent(target);
      const di = indexOfPage(target);
      if (di >= 0) listRef.current?.scrollToIndex({ index: di, animated: !reduceMotion });
    },
    [pages, hasPrev, hasNext, onEdge, indexOfPage, useCurl, reduceMotion],
  );

  const onSettle = useCallback(
    (e) => {
      if (!width) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      const cell = cells[idx];
      if (!cell) return;
      if (cell.k === 'page') {
        if (cell.i !== currentRef.current) {
          currentRef.current = cell.i;
          setCurrent(cell.i);
        }
      } else {
        onEdge?.(cell.k);
      }
    },
    [width, cells, onEdge],
  );

  const onTouchStart = useCallback((e) => {
    const p = e.nativeEvent.touches?.[0];
    if (p) touchRef.current = { x: p.pageX, y: p.pageY, time: Date.now() };
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      const start = touchRef.current;
      touchRef.current = null;
      const p = e.nativeEvent.changedTouches?.[0];
      if (!start || !p || !width) return;
      if (Date.now() - start.time > TAP_MAX_MS) return;
      if (Math.abs(p.pageX - start.x) > TAP_SLOP || Math.abs(p.pageY - start.y) > TAP_SLOP) return;
      if (chromeOpen) {
        onTap?.();
        return;
      }
      const frac = p.pageX / width;
      if (frac < EDGE_ZONE) goLogical(rtl ? 1 : -1); // physical left: previous page (LTR) / next page (RTL)
      else if (frac > 1 - EDGE_ZONE) goLogical(rtl ? -1 : 1);
      else onTap?.();
    },
    [width, chromeOpen, rtl, goLogical, onTap],
  );

  const renderCell = useCallback(
    ({ item }) => {
      if (item.k === 'page') {
        const p = pages[item.i];
        return (
          <PageCell
            slice={text.slice(p.start, p.end).replace(/\s+$/, '')}
            width={width}
            height={areaH}
            pad={horizontalPadding}
            fontSize={fontSize}
            lineHeight={lineHeight}
            rtl={rtl}
            fg={palette.fg}
          />
        );
      }
      return (
        <EdgeCell
          width={width}
          height={areaH}
          fg={palette.fg}
          label={item.k === 'next' ? t('reader.nextChapter') : t('reader.previousChapter')}
        />
      );
    },
    [pages, text, width, areaH, horizontalPadding, fontSize, lineHeight, rtl, palette.fg, t],
  );

  // Page `current + off` as a view, or null past either end of the chapter (the curl shows the edge cell there).
  const renderPageAt = useCallback(
    (off) => {
      const i = current + off;
      if (!pages || i < 0 || i >= pages.length) return null;
      const p = pages[i];
      return (
        <PageCell
          slice={text.slice(p.start, p.end).replace(/\s+$/, '')}
          width={width}
          height={areaH}
          pad={horizontalPadding}
          fontSize={fontSize}
          lineHeight={lineHeight}
          rtl={rtl}
          fg={palette.fg}
        />
      );
    },
    [pages, current, text, width, areaH, horizontalPadding, fontSize, lineHeight, rtl, palette.fg],
  );
  const renderEdge = useCallback(
    (k) => <EdgeCell width={width} height={areaH} fg={palette.fg} label={k === 'next' ? t('reader.nextChapter') : t('reader.previousChapter')} />,
    [width, areaH, palette.fg, t],
  );

  const getItemLayout = useCallback((_, index) => ({ length: width, offset: width * index, index }), [width]);
  const keyExtractor = useCallback((c) => (c.k === 'page' ? `p${c.i}` : c.k), []);

  const listKey = `${result?.key}|${hasPrev ? 1 : 0}${hasNext ? 1 : 0}|${rtl ? 1 : 0}`;
  const initialIndex = Math.max(indexOfPage(currentRef.current), 0);

  return (
    <View
      style={{ flex: 1, direction: 'ltr' }}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {size ? (
        <>
          <Text
            numberOfLines={1}
            style={{
              position: 'absolute',
              top: topInset + 6,
              left: horizontalPadding,
              right: horizontalPadding,
              color: palette.fg,
              opacity: 0.65,
              fontSize: 13,
              writingDirection: rtl ? 'rtl' : 'ltr',
              textAlign: rtl ? 'right' : 'left',
            }}
          >
            {chapterName}
          </Text>

          <View style={{ position: 'absolute', top: headerH, left: 0, right: 0, height: areaH }}>
            {useCurl ? (
              <PageCurl
                ref={curlRef}
                width={width}
                height={areaH}
                rtl={rtl}
                bg={palette.bg}
                fg={palette.fg}
                canNext={current < count - 1 || hasNext}
                canPrev={current > 0 || hasPrev}
                renderPage={renderPageAt}
                renderEdge={renderEdge}
                onCommit={commitLogical}
                onDragStart={onDragStart}
              />
            ) : pages ? (
              <FlatList
                key={listKey}
                ref={listRef}
                data={cells}
                extraData={renderCell}
                keyExtractor={keyExtractor}
                renderItem={renderCell}
                getItemLayout={getItemLayout}
                initialScrollIndex={initialIndex}
                horizontal
                pagingEnabled
                bounces={false}
                overScrollMode="never"
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                windowSize={3}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                onMomentumScrollEnd={onSettle}
                onScrollBeginDrag={onDragStart}
                style={{ direction: 'ltr' }}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={palette.fg} />
                <Text style={{ color: palette.fg, opacity: 0.6, marginTop: 12, fontSize: 13 }}>{t('reader.paginating')}</Text>
              </View>
            )}
          </View>

          {pages ? (
            <Text
              style={{
                position: 'absolute',
                bottom: bottomInset + 8,
                left: 0,
                right: 0,
                textAlign: 'center',
                color: palette.fg,
                opacity: 0.55,
                fontSize: 12,
              }}
            >
              {t('reader.pageOf', { page: Math.min(current + 1, count), total: count })}
            </Text>
          ) : null}

          {/* Off-screen measurer: same width and typography as a real page, never visible or interactive. */}
          {measureKey && textW > 0 ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size.w, opacity: 0 }}>
              <View style={{ paddingHorizontal: horizontalPadding }}>
                <Text
                  key={measureKey}
                  onTextLayout={onMeasured}
                  style={{
                    fontSize,
                    lineHeight: fontSize * lineHeight,
                    writingDirection: rtl ? 'rtl' : 'ltr',
                    textAlign: rtl ? 'right' : 'left',
                  }}
                >
                  {text}
                </Text>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export default memo(PagedReader);
