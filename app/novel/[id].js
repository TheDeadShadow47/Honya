import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import { loadPlugin, pluginApi } from '../../lib/pluginEngine';
import { decodeNavParam, encodeNavParam } from '../../lib/navIds';
import { setPendingReader } from '../../lib/readerContext';
import * as db from '../../db/database';
import ChapterRow, { CHAPTER_ROW_HEIGHT } from '../../components/ChapterRow';
import ChapterManageSheet from '../../components/ChapterManageSheet';
import { getCachedChapterPrefs, loadChapterPrefs, saveChapterPrefs } from '../../lib/chapterPrefs';
import NovelHeader from '../../components/NovelHeader';
import SelectionBar from '../../components/SelectionBar';

const DEFAULT_FILTERS = { downloaded: false, unread: false };
const DEFAULT_DISPLAY = { sourceTitle: false, chapterNumber: false };

// Throttles auto-refresh on rapid re-entry; the manual Refresh button bypasses it.
const FETCH_THROTTLE_MS = 10 * 60 * 1000;
const lastFetchedAt = new Map();

export default function NovelDetailsScreen() {
  const { id } = useLocalSearchParams();
  const novelId = decodeNavParam(id);
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const installedExtensions = useStore((s) => s.installedExtensions);
  const toggleLibrary = useStore((s) => s.toggleLibrary);
  const refreshUpdates = useStore((s) => s.refreshUpdates);
  const downloadStates = useStore((s) => s.downloadStates);
  const downloadChapter = useStore((s) => s.downloadChapter);
  const downloadMany = useStore((s) => s.downloadMany);
  const removeDownload = useStore((s) => s.removeDownload);

  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chaptersLoaded, setChaptersLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Restored from the in-memory cache so saved settings appear on first render.
  const initialPrefs = getCachedChapterPrefs(novelId);
  const [filters, setFilters] = useState(initialPrefs?.filters ?? DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState(initialPrefs?.sortKey ?? 'numberAsc');
  const [display, setDisplay] = useState(initialPrefs?.display ?? DEFAULT_DISPLAY);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [anchorId, setAnchorId] = useState(null);

  // Last-persisted snapshot; the effect only writes when settings actually change.
  const savedPrefsRef = useRef(
    JSON.stringify({
      filters: initialPrefs?.filters ?? DEFAULT_FILTERS,
      sortKey: initialPrefs?.sortKey ?? 'numberAsc',
      display: initialPrefs?.display ?? DEFAULT_DISPLAY,
    }),
  );

  useEffect(() => {
    const next = { filters, sortKey, display };
    const json = JSON.stringify(next);
    if (json === savedPrefsRef.current) return;
    savedPrefsRef.current = json;
    saveChapterPrefs(novelId, next);
  }, [filters, sortKey, display, novelId]);

  // Chapters queued by the current bulk download; 0 while idle.
  const [bulkDownloading, setBulkDownloading] = useState(0);

  // Refresh spinner for the header action; a ref guard blocks concurrent requests.
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  // Set on unmount so late async work never touches state or the DB queue.
  const cancelledRef = useRef(false);

  // Live mirror of the loaded novel for stable callbacks.
  const novelRef = useRef(null);
  novelRef.current = novel;

  const reload = useCallback(async () => {
    setNovel(await db.getNovel(novelId));
    setChapters(await db.getChapters(novelId));
  }, [novelId]);

  const fetchRemote = useCallback(
    async (base) => {
      const record = base?.pluginId ? installedExtensions[base.pluginId] : null;
      if (!record || !base?.path) return;
      if (cancelledRef.current) return;
      try {
        const instance = loadPlugin(record);
        const detail = await pluginApi.novel(instance, base.path);
        if (cancelledRef.current) return;
        const merged = {
          ...base,
          title: detail?.name ?? detail?.title ?? base.title,
          author: detail?.author ?? base.author,
          cover: detail?.cover ?? base.cover,
          status: detail?.status ?? base.status,
          summary: detail?.summary ?? detail?.description ?? base.summary,
          genres: Array.isArray(detail?.genres)
            ? detail.genres
            : typeof detail?.genres === 'string'
              ? detail.genres.split(/,\s*/)
              : base.genres,
          inLibrary: base.inLibrary,
        };
        await db.upsertNovel(merged);
        // Bail before the large chapter rewrite if the screen closed mid-fetch.
        if (cancelledRef.current) return;
        if (Array.isArray(detail?.chapters) && detail.chapters.length) {
          await db.replaceChapters(
            novelId,
            detail.chapters.map((c) => ({ ...c, id: `${novelId}::${c.path ?? c.name}` })),
          );
        }
        if (cancelledRef.current) return;
        await reload();
        await refreshUpdates();
        lastFetchedAt.set(novelId, Date.now());
      } catch (e) {
        if (!cancelledRef.current) Alert.alert(t('novel.couldNotLoad'), e.message);
      }
    },
    [installedExtensions, novelId, reload, refreshUpdates, t],
  );

  useEffect(() => {
    cancelledRef.current = false;
    let cancelled = false;
    (async () => {
      // Novel first for the header; chapters stream in behind it. The two reads are independent.
      const [base] = await Promise.all([db.getNovel(novelId), loadChapterPrefs()]);
      if (cancelled) return;
      const restored = getCachedChapterPrefs(novelId);
      if (restored) {
        savedPrefsRef.current = JSON.stringify(restored);
        setFilters(restored.filters);
        setSortKey(restored.sortKey);
        setDisplay(restored.display);
      }
      setNovel(base);
      setLoading(false);
      const list = await db.getChapters(novelId);
      if (cancelled) return;
      setChapters(list);
      setChaptersLoaded(true);
      // Skip the network round-trip within the throttle window.
      if (base && Date.now() - (lastFetchedAt.get(novelId) ?? 0) > FETCH_THROTTLE_MS) {
        fetchRemote(base);
      }
    })();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [novelId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- derived chapter data (computed once per input change) ---------- */

  // Filter, then sort; display prefs are render-time only.
  const visibleChapters = useMemo(() => {
    let list = chapters;
    if (filters.downloaded) list = list.filter((c) => !!c.downloaded);
    if (filters.unread) list = list.filter((c) => !c.read);
    const byNumber = (a, b) => (a.number ?? 0) - (b.number ?? 0);
    const byTime = (a, b) => (Date.parse(a.releaseTime) || 0) - (Date.parse(b.releaseTime) || 0) || byNumber(a, b);
    const sorted = list === chapters ? [...list] : list;
    if (sortKey === 'numberDesc') sorted.sort((a, b) => byNumber(b, a));
    else if (sortKey === 'newest') sorted.sort((a, b) => byTime(b, a));
    else if (sortKey === 'oldest') sorted.sort((a, b) => byTime(a, b));
    else sorted.sort(byNumber);
    return sorted;
  }, [chapters, filters, sortKey]);

  // Resume target: last unfinished chapter, else first unread; uses existing progress columns only.
  const { resumeChapter, resumeIsContinue } = useMemo(() => {
    let inProgress = null;
    let firstUnread = null;
    let anyRead = false;
    for (let i = 0; i < chapters.length; i += 1) {
      const c = chapters[i];
      if (c.read) anyRead = true;
      if (!c.read && (c.progress ?? 0) > 0.02) {
        if (!inProgress || (c.lastReadAt ?? 0) > (inProgress.lastReadAt ?? 0)) inProgress = c;
      }
      if (!c.read && (!firstUnread || (c.number ?? 0) < (firstUnread.number ?? 0))) firstUnread = c;
    }
    const target = inProgress ?? firstUnread ?? chapters[chapters.length - 1] ?? null;
    return { resumeChapter: target, resumeIsContinue: !!(inProgress || anyRead) };
  }, [chapters]);

  const selectedCount = selectedIds.size;
  const filtersActive = filters.downloaded || filters.unread;
  const manageActive = filtersActive || sortKey !== 'numberAsc' || display.sourceTitle || display.chapterNumber;
  const sourceName = novel?.pluginId ? installedExtensions[novel.pluginId]?.name : undefined;

  /* ---------- selection ---------- */

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
    setAnchorId(null);
    setBulkDownloading(0);
  }, []);

  const toggleSelect = useCallback((chapterId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  // Android hardware back: exit selection mode first, then let the router navigate.
  useEffect(() => {
    if (!selecting) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelect();
      return true;
    });
    return () => sub.remove();
  }, [selecting, exitSelect]);

  const visibleRef = useRef(visibleChapters);
  visibleRef.current = visibleChapters;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const anchorIdRef = useRef(anchorId);
  anchorIdRef.current = anchorId;

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === visibleRef.current.length ? new Set() : new Set(visibleRef.current.map((c) => c.id)),
    );
  }, []);

  const selectedChapters = useCallback(
    () => visibleRef.current.filter((c) => selectedRef.current.has(c.id)),
    [],
  );

  /* ---------- one-tap range actions ---------- */

  // Range actions expand the displayed-order selection; the anchor re-frames "except this" / "in between".
  const selectAllExcept = useCallback(() => {
    const next = new Set(visibleRef.current.map((c) => c.id));
    next.delete(anchorIdRef.current);
    setSelectedIds(next);
  }, []);

  // With exactly two selected, selects every displayed chapter between them.
  const selectBetween = useCallback(() => {
    const list = visibleRef.current;
    const [a, b] = Array.from(selectedRef.current);
    const from = list.findIndex((c) => c.id === a);
    const to = list.findIndex((c) => c.id === b);
    if (from === -1 || to === -1) return;
    const [lo, hi] = from < to ? [from, to] : [to, from];
    const next = new Set();
    for (let i = lo; i <= hi; i += 1) next.add(list[i].id);
    setSelectedIds(next);
  }, []);

  /* ---------- stable row callbacks (keep ChapterRow memoised) ---------- */

  const selectingRef = useRef(selecting);
  selectingRef.current = selecting;

  const openChapter = useCallback(
    (chapter) => {
      if (selectingRef.current) toggleSelect(chapter.id);
      else {
        setPendingReader({
          id: chapter.id,
          name: chapter.name,
          novelId: chapter.novelId,
          novelTitle: novelRef.current?.title,
        });
        router.push(`/reader/${encodeNavParam(chapter.id)}`);
      }
    },
    [router, toggleSelect],
  );

  // Long-press enters selection mode with that chapter as anchor; later long-presses re-anchor.
  const longPressChapter = useCallback((chapter) => {
    if (!selectingRef.current) setSelecting(true);
    setAnchorId(chapter.id);
    setSelectedIds(new Set([chapter.id]));
  }, []);

  const onDownloadChapter = useCallback(
    async (chapter) => {
      try {
        await downloadChapter(chapter);
        await reload();
      } catch (e) {
        Alert.alert(t('reader.downloadFailed'), e.message);
      }
    },
    [downloadChapter, reload, t],
  );

  const onRemoveDownload = useCallback(
    (chapter) => {
      Alert.alert(t('reader.removeDownload'), t('reader.removeDownloadSubtitle'), [
        { text: t('more.resetCancel'), style: 'cancel' },
        {
          text: t('reader.remove'),
          style: 'destructive',
          onPress: async () => {
            await removeDownload(chapter.id);
            await reload();
          },
        },
      ]);
    },
    [removeDownload, reload, t],
  );

  /* ---------- bulk actions (existing functionality only) ---------- */

  // Re-entry guard: don't start a second bulk download while one is in flight.
  const bulkDownloadingRef = useRef(bulkDownloading);
  bulkDownloadingRef.current = bulkDownloading;

  const bulkDownload = useCallback(async () => {
    if (bulkDownloadingRef.current > 0) return;
    // Skip chapters already downloaded to save concurrency slots.
    const list = selectedChapters().filter((c) => !c.downloaded);
    if (!list.length) {
      Alert.alert(t('md3.somethingWentWrong'), t('settingsStorage.cleanupSubtitle'));
      return;
    }
    setBulkDownloading(list.length);
    const { ok, failed } = await downloadMany(list);
    // Bail if the screen was unmounted while downloads were in flight.
    if (cancelledRef.current) return;
    setBulkDownloading(0);
    await reload();
    // Selection stays active so rows show "Offline" on the completed chapters.
    Alert.alert(
      t('reader.downloadFailed'),
      failed ? `${t('selection.selected', { count: ok, plural: ok === 1 ? '' : 's' })}, ${t('selection.selected', { count: failed, plural: failed === 1 ? '' : 's' })} ${t('md3.tryAgain').toLowerCase()}.` : `${ok} ${t('chapterManage.chapterNumber').toLowerCase()}${ok === 1 ? '' : 's'} ${t('selection.download').toLowerCase()}.`,
    );
  }, [selectedChapters, downloadMany, reload, t]);

  const bulkRemoveDownload = useCallback(() => {
    const list = selectedChapters().filter((c) => c.downloaded);
    if (!list.length) {
      Alert.alert(t('md3.somethingWentWrong'), t('more.resetPrefsSubtitle'));
      return;
    }
    Alert.alert(t('reader.removeDownload'), t('reader.removeDownloadSubtitle'), [
      { text: t('more.resetCancel'), style: 'cancel' },
      {
        text: t('reader.remove'),
        style: 'destructive',
        onPress: async () => {
          for (const c of list) await removeDownload(c.id);
          await reload();
          exitSelect();
        },
      },
    ]);
  }, [selectedChapters, removeDownload, reload, exitSelect, t]);

  const bulkMarkRead = useCallback(
    async (read) => {
      const ids = Array.from(selectedRef.current);
      if (!ids.length) return;
      await db.markChaptersRead(ids, read);
      if (cancelledRef.current) return;
      await reload();
      exitSelect();
    },
    [reload, exitSelect],
  );

  const markRead = useCallback(() => bulkMarkRead(true), [bulkMarkRead]);
  const markUnread = useCallback(() => bulkMarkRead(false), [bulkMarkRead]);

  /* ---------- header callbacks ---------- */

  const onBack = useCallback(() => router.back(), [router]);
  const onToggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const onMigrate = useCallback(
    () => router.push(`/novel/migrate?id=${encodeNavParam(novelId)}`),
    [router, novelId],
  );
  const onRefreshNovel = useCallback(async () => {
    if (refreshingRef.current || !novel) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await fetchRemote(novel);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [fetchRemote, novel]);
  const onToggleLibrary = useCallback(async () => {
    await toggleLibrary(novel);
    await reload();
  }, [toggleLibrary, novel, reload]);
  const openManage = useCallback(() => setSheetOpen(true), []);
  const closeManage = useCallback(() => setSheetOpen(false), []);
  const onFilterChange = useCallback((key, value) => setFilters((f) => ({ ...f, [key]: value })), []);
  const onDisplayChange = useCallback((key, value) => setDisplay((d) => ({ ...d, [key]: value })), []);
  const resetManage = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDisplay(DEFAULT_DISPLAY);
    setSortKey('numberAsc');
  }, []);
  const onResume = useCallback(() => {
    if (resumeChapter) {
      setPendingReader({
        id: resumeChapter.id,
        name: resumeChapter.name,
        novelId: resumeChapter.novelId,
        novelTitle: novelRef.current?.title,
      });
      router.push(`/reader/${encodeNavParam(resumeChapter.id)}`);
    }
  }, [router, resumeChapter]);

  const renderItem = useCallback(
    ({ item }) => (
      <ChapterRow
        chapter={item}
        downloadState={downloadStates[item.id]}
        selecting={selecting}
        selected={selectedIds.has(item.id)}
        onPress={openChapter}
        onLongPress={longPressChapter}
        onDownload={onDownloadChapter}
        onRemoveDownload={onRemoveDownload}
        showNumber={display.chapterNumber}
        showSource={display.sourceTitle}
        sourceName={sourceName}
      />
    ),
    [
      downloadStates,
      selecting,
      selectedIds,
      openChapter,
      longPressChapter,
      onDownloadChapter,
      onRemoveDownload,
      display.chapterNumber,
      display.sourceTitle,
      sourceName,
    ],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // getItemLayout offsets must include the measured ListHeader height to place the render window correctly.
  const headerHeightRef = useRef(0);
  const onHeaderLayout = useCallback((e) => {
    headerHeightRef.current = e.nativeEvent.layout.height;
  }, []);
  const getItemLayout = useCallback(
    (_, index) => ({
      length: CHAPTER_ROW_HEIGHT,
      offset: headerHeightRef.current + CHAPTER_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!novel) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.text }}>{t('novel.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={visibleChapters}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={selectedIds}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        maxToRenderPerBatch={21}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View onLayout={onHeaderLayout}>
            <NovelHeader
              novel={novel}
              sourceName={sourceName}
              topInset={insets.top}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
              onBack={onBack}
              onToggleLibrary={onToggleLibrary}
              onMigrate={onMigrate}
              onRefresh={onRefreshNovel}
              refreshing={refreshing}
              resumeChapter={resumeChapter}
              resumeIsContinue={resumeIsContinue}
              onResume={onResume}
              totalChapters={chapters.length}
              shownChapters={visibleChapters.length}
              filtered={filtersActive}
              manageActive={manageActive}
              onOpenManage={openManage}
            />
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 24 }}>
            {!chaptersLoaded
              ? t('novel.loadingChapters')
              : chapters.length === 0
                ? t('novel.noChapters')
                : t('novel.noChaptersMatchFilters')}
          </Text>
        }
      />

      {selecting ? (
        <SelectionBar
          count={selectedCount}
          total={visibleChapters.length}
          topInset={insets.top}
          onClose={exitSelect}
          onToggleAll={toggleAll}
          onDownload={bulkDownload}
          onRemoveDownload={bulkRemoveDownload}
          onMarkRead={markRead}
          onMarkUnread={markUnread}
          hasAnchor={!!anchorId}
          canSelectBetween={selectedIds.size === 2}
          onSelectAllExcept={selectAllExcept}
          onSelectBetween={selectBetween}
          downloading={bulkDownloading > 0}
          downloadingCount={bulkDownloading}
        />
      ) : null}

      <ChapterManageSheet
        visible={sheetOpen}
        onDismiss={closeManage}
        filters={filters}
        onFilterChange={onFilterChange}
        sortKey={sortKey}
        onSortChange={setSortKey}
        display={display}
        onDisplayChange={onDisplayChange}
        onReset={resetManage}
        canReset={manageActive}
      />
    </View>
  );
}
