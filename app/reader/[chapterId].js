import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ScrollView, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../hooks/useI18n';
import * as db from '../../db/database';
import { loadPlugin, pluginApi } from '../../lib/pluginEngine';
import { decodeEntities, stripHtml } from '../../lib/clean';
import { decodeNavParam, encodeNavParam } from '../../lib/navIds';
import { RADIUS, READER_BACKGROUNDS } from '../../theme/theme';
import { isArabicText } from '../../lib/i18n';
import Ripple from '../../components/Ripple';

const OFFLINE_RE = /Network request failed|Failed to fetch|fetch failed|Network is unreachable|Unable to resolve host|ENETUNREACH|ECONNRESET|ECONNREFUSED|timeout|timed out/i;

// Cumulative content offset of a segment's top edge (paddingTop + all prior heights).
function segOffset(heights, paddingTop, index) {
  let s = paddingTop;
  for (let i = 0; i < index; i++) s += heights[i] ?? 0;
  return s;
}

// The segment that owns scroll position y (in content coordinates).
function activeIndexAt(heights, paddingTop, y) {
  let acc = paddingTop;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i] ?? 0;
    if (acc + h >= y) return i;
    acc += h;
  }
  return Math.max(0, heights.length - 1);
}

/** Chapter name flanked by rules, rendered between appended chapters. */
function ChapterDivider({ name, fg }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 36, marginBottom: 22 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: fg + '33' }} />
      <Text style={{ color: fg, opacity: 0.7, fontSize: 13, fontWeight: '600', marginHorizontal: 14 }}>{name}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: fg + '33' }} />
    </View>
  );
}

/** Inline load failure for an appended chapter (offline / network error). */
function InlineError({ offline, error, fg, bg, onRetry, t }) {
  return (
    <View style={{ marginVertical: 28 }}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>
        {offline ? t('reader.notAvailableOffline') : t('reader.couldNotLoad')}
      </Text>
      <Text style={{ color: fg, opacity: 0.7, marginTop: 8, lineHeight: 20 }}>
        {offline
          ? t('reader.offlineHint')
          : error}
      </Text>
      <View style={{ marginTop: 14, borderRadius: RADIUS.pill, overflow: 'hidden', alignSelf: 'flex-start' }}>
        <Ripple onPress={onRetry}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              height: 42,
              backgroundColor: fg,
              borderRadius: RADIUS.pill,
            }}
          >
            <Ionicons name="refresh" size={16} color={bg} />
            <Text style={{ color: bg, fontWeight: '700', marginLeft: 8 }}>{t('reader.retry')}</Text>
          </View>
        </Ripple>
      </View>
    </View>
  );
}

export default function ReaderScreen() {
  const { chapterId } = useLocalSearchParams();
  const id = decodeNavParam(chapterId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const contentPadTop = insets.top + 28;

  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const installedExtensions = useStore((s) => s.installedExtensions);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const refreshHistory = useStore((s) => s.refreshHistory);
  const downloadStates = useStore((s) => s.downloadStates);
  const downloadChapter = useStore((s) => s.downloadChapter);
  const removeDownload = useStore((s) => s.removeDownload);

  const palette = READER_BACKGROUNDS.find((b) => b.key === prefs.readerBackground) ?? READER_BACKGROUNDS[1];

  const [chapter, setChapter] = useState(null);
  const [novel, setNovel] = useState(null);
  const [neighbours, setNeighbours] = useState({ prev: null, next: null });
  // Continuous reading: an ordered list of rendered chapters.
  const [segments, setSegments] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const [uiVisible, setUiVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const touchStartRef = useRef(null);
  // Scroll persistence: written at most once per second so SQLite writes never
  // compete with the scroll gesture.
  const progressRef = useRef(0);
  const lastSaveRef = useRef(0);
  const restoredRef = useRef(false);

  // Live mirrors for async callbacks (segment fetches resolve after scrolls move on).
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const novelRef = useRef(null);
  const installedRef = useRef({});
  const segmentsRef = useRef([]);
  const activeIndexRef = useRef(0);
  const heightsRef = useRef([]);
  const progressMapRef = useRef(new Map());
  const markedIdsRef = useRef(new Set());
  const appendedIdsRef = useRef(new Set());
  const appendingRef = useRef(false);
  const endRef = useRef(false);
  const viewportRef = useRef(0);

  useEffect(() => {
    Animated.timing(fade, { toValue: uiVisible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [uiVisible, fade]);

  useEffect(() => {
    Animated.spring(slide, { toValue: settingsOpen ? 1 : 0, useNativeDriver: true, damping: 18 }).start();
  }, [settingsOpen, slide]);

  // New chapter → start from the top (router.replace keeps this screen mounted).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ y: 0, animated: false });
  }, [id]);

  /** Fetch a chapter's cleaned text, from the download cache or the plugin. */
  const fetchChapterText = useCallback(async (ch) => {
    if (ch.downloadedText) {
      // Stored text was cleaned at download time; re-decode entities so chapters
      // downloaded before the decoder existed still render cleanly.
      return decodeEntities(ch.downloadedText);
    }
    const record = novelRef.current?.pluginId ? installedRef.current[novelRef.current.pluginId] : null;
    if (!record) throw new Error('The source extension for this novel is not installed');
    const instance = loadPlugin(record);
    const raw = await pluginApi.chapter(instance, ch.path);
    const clean = stripHtml(raw);
    if (!clean) throw new Error('The source returned an empty chapter');
    return clean;
  }, []);

  /** Append the chapter after the last loaded one (or a failed placeholder). */
  const appendNextSegment = useCallback(async () => {
    if (appendingRef.current || endRef.current) return;
    const last = segmentsRef.current[segmentsRef.current.length - 1];
    if (!last || !last.ch?.novelId) return;
    appendingRef.current = true;
    try {
      const adj = await db.getAdjacentChapters(last.ch.novelId, last.ch.number ?? 0);
      const next = adj.next;
      if (!next) {
        endRef.current = true;
        return;
      }
      if (appendedIdsRef.current.has(next.id)) return; // already in the list
      let seg = { id: next.id, name: next.name, ch: next, text: '', rtl: false, status: 'ready', error: null, offline: false };
      try {
        const text = await fetchChapterText(next);
        // Each appended chapter gets its own direction, computed once from its
        // own text — a continuous-reading session can freely mix English and
        // Arabic chapters without any of them inheriting a sibling's direction.
        seg = { ...seg, text, rtl: isArabicText(text) };
      } catch (e) {
        const msg = String(e?.message ?? '');
        seg = { ...seg, status: 'failed', error: msg, offline: OFFLINE_RE.test(msg) };
      }
      appendedIdsRef.current.add(next.id);
      const nextSegments = [...segmentsRef.current, seg];
      segmentsRef.current = nextSegments;
      setSegments(nextSegments);
      if (seg.status === 'ready') {
        db.touchChapterRead(next.id).catch(() => {});
        refreshHistory();
        // "Mark read on open" applies to chapters the reader auto-opens too.
        if (prefsRef.current.markReadOnOpen && !markedIdsRef.current.has(next.id)) {
          markedIdsRef.current.add(next.id);
          db.markChapterRead(next.id, true).then(() => refreshLibrary());
        }
      }
    } finally {
      appendingRef.current = false;
    }
  }, [fetchChapterText, refreshHistory, refreshLibrary]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffline(false);
    // Reset all continuous-reading state for the new entry chapter.
    segmentsRef.current = [];
    heightsRef.current = [];
    progressMapRef.current = new Map();
    markedIdsRef.current = new Set();
    appendedIdsRef.current = new Set();
    appendingRef.current = false;
    endRef.current = false;
    activeIndexRef.current = 0;
    setSegments([]);
    setActiveIndex(0);
    try {
      const ch = await db.getChapter(id);
      if (!ch) throw new Error('Chapter not found locally');
      setChapter(ch);
      installedRef.current = installedExtensions;

      // The novel record is only needed for the header (title/back-bar) and to
      // resolve the plugin for a *non*-downloaded chapter. A downloaded chapter's
      // text can be decoded straight away without waiting on that DB read, so the
      // two run in parallel instead of one blocking the other.
      const novelPromise = db.getNovel(ch.novelId).then((nv) => {
        novelRef.current = nv;
        setNovel(nv);
        return nv;
      });

      let text;
      if (ch.downloadedText) {
        // Nothing here needs the novel record — decode and render right away.
        text = decodeEntities(ch.downloadedText);
        novelPromise.catch(() => {}); // still resolves in the background for the header
      } else {
        await novelPromise; // remote fetch needs the plugin record
        text = await fetchChapterText(ch);
      }

      const seg = { id: ch.id, name: ch.name, ch, text, rtl: isArabicText(text), status: 'ready', error: null, offline: false };
      segmentsRef.current = [seg];
      setSegments([seg]);
      restoredRef.current = false;
      progressRef.current = ch.progress ?? 0;
      // Opening a chapter is what puts it in History; read state is untouched.
      await db.touchChapterRead(id);
      refreshHistory();
      if (prefsRef.current.markReadOnOpen) {
        await db.markChapterRead(id, true);
        markedIdsRef.current.add(id);
        await refreshLibrary();
      }
    } catch (e) {
      setError(e.message);
      setOffline(OFFLINE_RE.test(String(e?.message ?? '')) && !(await db.getChapter(id))?.downloadedText);
    } finally {
      setLoading(false);
    }
  }, [id, installedExtensions, fetchChapterText, refreshLibrary, refreshHistory]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep prev/next chevrons aligned with the currently active chapter.
  useEffect(() => {
    const seg = segmentsRef.current[activeIndexRef.current];
    const novelId = seg?.ch?.novelId ?? novelRef.current?.id;
    if (!novelId) return;
    let alive = true;
    db.getAdjacentChapters(novelId, seg?.ch?.number ?? 0)
      .then((n) => {
        if (alive) setNeighbours(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeIndex, segments]);

  const handleSegmentLayout = useCallback((index, height) => {
    heightsRef.current[index] = height;
  }, []);

  /**
   * Restores the previous scroll position once the chapter body has been laid
   * out, then keeps appending while chapters are too short to fill the screen.
   * Runs once per chapter and only when there is meaningful progress, so a
   * fresh chapter still starts at the top.
   */
  const handleContentSizeChange = useCallback(
    (_w, height) => {
      if (loading) return;
      if (!restoredRef.current) {
        restoredRef.current = true;
        const saved = progressRef.current;
        if (saved > 0.02 && saved < 0.99 && height > 0) {
          scrollRef.current?.scrollTo({ y: height * saved, animated: false });
        } else {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
      }
      // If the whole list barely fills the viewport there is almost nothing to
      // scroll, so pull the next chapter in right away (chains until the list
      // actually overflows — the < 300 bound keeps it from running away).
      if (!appendingRef.current && !endRef.current && height - viewportRef.current < 300) {
        appendNextSegment();
      }
    },
    [loading, appendNextSegment],
  );

  const handleScroll = useCallback(
    ({ nativeEvent }) => {
      if (loading) return;
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
      viewportRef.current = layoutMeasurement.height;
      const y = contentOffset.y;
      const segs = segmentsRef.current;
      if (!segs.length) return;

      const idx = Math.max(0, Math.min(activeIndexAt(heightsRef.current, contentPadTop, y), segs.length - 1));
      const prevIdx = activeIndexRef.current;
      const lastId = segs[segs.length - 1]?.id;

      if (idx !== prevIdx) {
        // Crossed a chapter boundary.
        const prevSeg = segs[prevIdx];
        if (prevSeg) {
          if (idx > prevIdx) {
            // Forward cross: the previous chapter is finished.
            progressMapRef.current.set(prevSeg.id, 1);
            db.saveChapterProgress(prevSeg.id, 1).catch(() => {});
            if (!prefsRef.current.markReadOnOpen && !markedIdsRef.current.has(prevSeg.id)) {
              markedIdsRef.current.add(prevSeg.id);
              db.markChapterRead(prevSeg.id, true).then(refreshLibrary);
            } else {
              markedIdsRef.current.add(prevSeg.id);
            }
          } else {
            // Backward cross: persist where we left off.
            const pr = progressMapRef.current.get(prevSeg.id) ?? 0;
            if (pr > 0) db.saveChapterProgress(prevSeg.id, pr).catch(() => {});
          }
        }
        activeIndexRef.current = idx;
        setActiveIndex(idx);
        // Entering the last loaded segment → prefetch the next chapter.
        if (idx === segs.length - 1) appendNextSegment();
      } else {
        // Within one chapter: track a local ratio.
        const seg = segs[idx];
        if (seg) {
          const top = segOffset(heightsRef.current, contentPadTop, idx);
          const segH = heightsRef.current[idx] ?? 0;
          const scrollable = Math.max(segH - viewportRef.current, 1);
          const ratio = Math.max(0, Math.min(1, (y - top) / scrollable));
          progressMapRef.current.set(seg.id, ratio);
          progressRef.current = ratio;
          const now = Date.now();
          if (now - lastSaveRef.current > 1000) {
            lastSaveRef.current = now;
            db.saveChapterProgress(seg.id, ratio).catch(() => {});
          }
        }
      }

      // Mark the last chapter read when the reader hits the very end.
      const reachedEnd = y + layoutMeasurement.height >= contentSize.height - 80;
      if (reachedEnd && idx === segs.length - 1 && lastId && !prefsRef.current.markReadOnOpen && !markedIdsRef.current.has(lastId)) {
        markedIdsRef.current.add(lastId);
        db.markChapterRead(lastId, true).then(refreshLibrary);
      }

      // Prefetch the next chapter as the bottom approaches (also covers fast scrolls).
      const distToEnd = contentSize.height - (y + layoutMeasurement.height);
      if (!appendingRef.current && !endRef.current && distToEnd < Math.max(viewportRef.current * 0.7, 700)) {
        appendNextSegment();
      }
    },
    [loading, appendNextSegment, refreshLibrary, contentPadTop],
  );

  // Flush every chapter's last known position when leaving the screen.
  useEffect(() => {
    return () => {
      progressMapRef.current.forEach((ratio, cid) => {
        if (ratio > 0) db.saveChapterProgress(cid, ratio).catch(() => {});
      });
    };
  }, []);

  // Detect a genuine tap (no drag) without ever claiming the scroll responder.
  const handleTouchStart = useCallback((e) => {
    const t = e.nativeEvent.touches && e.nativeEvent.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.pageX, y: t.pageY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.nativeEvent.changedTouches && e.nativeEvent.changedTouches[0];
      if (!t) return;
      const dx = Math.abs(t.pageX - start.x);
      const dy = Math.abs(t.pageY - start.y);
      const dt = Date.now() - start.time;
      if (dt > 350 || dx > 10 || dy > 10) return;
      if (settingsOpen) setSettingsOpen(false);
      else setUiVisible((v) => !v);
    },
    [settingsOpen],
  );

  const goTo = (target) => {
    if (!target) return;
    setSettingsOpen(false);
    setUiVisible(false);
    router.replace(`/reader/${encodeNavParam(target.id)}`);
  };

  const activeSeg = segments[activeIndex] ?? null;
  const activeId = activeSeg?.id ?? id;
  const isDownloading = downloadStates[activeId] === 'downloading';
  const isDownloaded = !!activeSeg?.ch?.downloadedText;

  /** Re-read a chapter row after download/removal so the rendered segment updates. */
  const refreshSegment = useCallback(
    async (chapterId) => {
      const row = await db.getChapter(chapterId);
      if (!row) return;
      const decoded = decodeEntities(row.downloadedText);
      const next = segmentsRef.current.map((s) =>
        s.id === chapterId
          ? { ...s, ch: row, text: decoded, rtl: isArabicText(decoded), status: 'ready', error: null, offline: false }
          : s,
      );
      segmentsRef.current = next;
      setSegments(next);
      if (chapterId === id) setChapter(row);
    },
    [id],
  );

  const onDownload = async () => {
    const seg = activeSeg;
    if (!seg || isDownloading) return;
    try {
      await downloadChapter(seg.ch);
      await refreshSegment(seg.id);
    } catch (e) {
      Alert.alert(t('reader.downloadFailed'), e.message);
    }
  };

  const onRemoveDownload = () => {
    const seg = activeSeg;
    if (!seg) return;
    Alert.alert(t('reader.removeDownload'), t('reader.removeDownloadSubtitle'), [
      { text: t('more.resetCancel'), style: 'cancel' },
      {
        text: t('reader.remove'),
        style: 'destructive',
        onPress: async () => {
          await removeDownload(seg.id);
          await refreshSegment(seg.id);
        },
      },
    ]);
  };

  /** Re-fetch a failed appended segment (used by its inline Retry). */
  const retrySegment = useCallback(
    async (segId) => {
      const seg = segmentsRef.current.find((s) => s.id === segId);
      if (!seg) return;
      segmentsRef.current = segmentsRef.current.map((s) => (s.id === segId ? { ...s, status: 'loading', error: null } : s));
      setSegments(segmentsRef.current);
      try {
        const text = await fetchChapterText(seg.ch);
        const next = segmentsRef.current.map((s) =>
          s.id === segId ? { ...s, text, rtl: isArabicText(text), status: 'ready', error: null, offline: false } : s,
        );
        segmentsRef.current = next;
        setSegments(next);
        db.touchChapterRead(segId).catch(() => {});
        refreshHistory();
      } catch (e) {
        const msg = String(e?.message ?? '');
        const next = segmentsRef.current.map((s) =>
          s.id === segId ? { ...s, status: 'failed', error: msg, offline: OFFLINE_RE.test(msg) } : s,
        );
        segmentsRef.current = next;
        setSegments(next);
      }
    },
    [fetchChapterText, refreshHistory],
  );

  const onScrollBeginDrag = useCallback(() => {
    setUiVisible(false);
    if (settingsOpen) setSettingsOpen(false);
  }, [settingsOpen]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar hidden={!uiVisible} />

      <View style={{ flex: 1 }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, direction: 'ltr' }}
          onLayout={(e) => {
            viewportRef.current = e.nativeEvent.layout.height;
          }}
          contentContainerStyle={{
            paddingHorizontal: prefs.horizontalPadding,
            paddingTop: contentPadTop,
            paddingBottom: insets.bottom + 90,
          }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={64}
          onScrollBeginDrag={onScrollBeginDrag}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color={palette.fg} style={{ marginTop: 60 }} />
          ) : error ? (
            <View style={{ marginTop: 60, alignItems: 'flex-start' }}>
              <InlineError
                offline={offline}
                error={error}
                fg={palette.fg}
                bg={palette.bg}
                onRetry={load}
                t={t}
              />
            </View>
          ) : (
            segments.map((seg, idx) => (
              <View key={seg.id} onLayout={(e) => handleSegmentLayout(idx, e.nativeEvent.layout.height)}>
                {idx === 0 ? (
                  <Text style={{ color: palette.fg, opacity: 0.65, fontSize: 13, marginBottom: 18 }}>{seg.name}</Text>
                ) : (
                  <ChapterDivider name={seg.name} fg={palette.fg} />
                )}
                {seg.status === 'loading' ? (
                  <ActivityIndicator color={palette.fg} style={{ marginTop: 24, marginBottom: 8 }} />
                ) : seg.status === 'failed' ? (
                  <InlineError
                    offline={seg.offline}
                    error={seg.error}
                    fg={palette.fg}
                    bg={palette.bg}
                    onRetry={() => retrySegment(seg.id)}
                    t={t}
                  />
                ) : (
                  <Text
                    style={{
                      color: palette.fg,
                      fontSize: prefs.fontSize,
                      lineHeight: prefs.fontSize * prefs.lineHeight,
                      // Each segment carries its own direction, computed from its own
                      // text — independent of the app's UI language/RTL setting.
                      // `textAlign` has to be set explicitly alongside `writingDirection`:
                      // left as 'auto' it resolves against the app's global RTL state
                      // (from I18nManager), not the text's own script, which is exactly
                      // what made English chapters render right-aligned under an Arabic UI.
                      writingDirection: seg.rtl ? 'rtl' : 'ltr',
                      textAlign: seg.rtl ? 'right' : 'left',
                    }}
                  >
                    {seg.text}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <Animated.View
        pointerEvents={uiVisible ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          opacity: fade,
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 8,
          backgroundColor: palette.bg + 'f2',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Ripple onPress={() => router.back()} borderless>
          <View style={{ padding: 10 }}>
            <Ionicons name="arrow-back" size={22} color={palette.fg} />
          </View>
        </Ripple>
        <View style={{ flex: 1, marginHorizontal: 6 }}>
          <Text numberOfLines={1} style={{ color: palette.fg, fontWeight: '700', fontSize: 15 }}>
            {novel?.title ?? 'Reader'}
          </Text>
          <Text numberOfLines={1} style={{ color: palette.fg, opacity: 0.65, fontSize: 12, marginTop: 2 }}>
            {activeSeg?.name ?? chapter?.name ?? ''}
          </Text>
        </View>
        <Ripple onPress={isDownloading ? undefined : isDownloaded ? onRemoveDownload : onDownload} borderless disabled={isDownloading}>
          <View style={{ padding: 10 }}>
            {isDownloading ? (
              <ActivityIndicator size="small" color={palette.fg} />
            ) : (
              <Ionicons
                name={isDownloaded ? 'checkmark-done' : 'download-outline'}
                size={21}
                color={palette.fg}
              />
            )}
          </View>
        </Ripple>
        <Ripple onPress={load} borderless>
          <View style={{ padding: 10 }}>
            <Ionicons name="refresh" size={20} color={palette.fg} />
          </View>
        </Ripple>
      </Animated.View>

      <Animated.View
        pointerEvents={uiVisible ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          opacity: fade,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
          paddingHorizontal: 6,
          backgroundColor: palette.bg + 'f2',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Ripple onPress={() => goTo(neighbours.prev)} borderless>
          <View style={{ padding: 12, opacity: neighbours.prev ? 1 : 0.3 }}>
            <Ionicons name="chevron-back" size={24} color={palette.fg} />
          </View>
        </Ripple>
        <Ripple onPress={() => setSettingsOpen((v) => !v)} borderless>
          <View style={{ padding: 12 }}>
            <Ionicons name="options-outline" size={23} color={palette.fg} />
          </View>
        </Ripple>
        <Ripple onPress={() => goTo(neighbours.next)} borderless>
          <View style={{ padding: 12, opacity: neighbours.next ? 1 : 0.3 }}>
            <Ionicons name="chevron-forward" size={24} color={palette.fg} />
          </View>
        </Ripple>
      </Animated.View>

      <Animated.View
        pointerEvents={settingsOpen ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }) }],
          backgroundColor: palette.bg,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: insets.bottom + 22,
          borderTopWidth: 1,
          borderColor: palette.fg + '22',
        }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.fg + '55' }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 15 }}>{t('reader.settings')}</Text>
          <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
            <Ripple onPress={() => setSettingsOpen(false)} borderless>
              <View style={{ padding: 8 }}>
                <Ionicons name="close" size={22} color={palette.fg} />
              </View>
            </Ripple>
          </View>
        </View>

        <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 13, marginTop: 16 }}>{t('reader.background')}</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
          {READER_BACKGROUNDS.map((b) => (
            <Ripple key={b.key} onPress={() => setPref('readerBackground', b.key)}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: RADIUS.md,
                  backgroundColor: b.bg,
                  borderWidth: prefs.readerBackground === b.key ? 2 : 1,
                  borderColor: prefs.readerBackground === b.key ? palette.fg : palette.fg + '33',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: b.fg, fontWeight: '800' }}>A</Text>
              </View>
            </Ripple>
          ))}
        </View>

        <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 13, marginTop: 18 }}>
          {t('reader.fontSize')} · {prefs.fontSize}
        </Text>
        <Slider
          minimumValue={12}
          maximumValue={32}
          step={1}
          value={prefs.fontSize}
          onValueChange={(v) => setPref('fontSize', Math.round(v))}
          minimumTrackTintColor={palette.fg}
          maximumTrackTintColor={palette.fg + '44'}
          thumbTintColor={palette.fg}
        />

        <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 13, marginTop: 8 }}>
          {t('reader.lineHeight')} · {prefs.lineHeight.toFixed(1)}
        </Text>
        <Slider
          minimumValue={1.2}
          maximumValue={2.4}
          step={0.1}
          value={prefs.lineHeight}
          onValueChange={(v) => setPref('lineHeight', Math.round(v * 10) / 10)}
          minimumTrackTintColor={palette.fg}
          maximumTrackTintColor={palette.fg + '44'}
          thumbTintColor={palette.fg}
        />

        <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 13, marginTop: 8 }}>
          {t('reader.sidePadding')} · {prefs.horizontalPadding}
        </Text>
        <Slider
          minimumValue={8}
          maximumValue={48}
          step={2}
          value={prefs.horizontalPadding}
          onValueChange={(v) => setPref('horizontalPadding', Math.round(v))}
          minimumTrackTintColor={palette.fg}
          maximumTrackTintColor={palette.fg + '44'}
          thumbTintColor={palette.fg}
        />
      </Animated.View>
    </View>
  );
}
