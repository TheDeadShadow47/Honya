import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { markFetched, shouldFetch } from '../../lib/novelFetchThrottle';
import { showToast } from '../../lib/toast';

const DEFAULT_FILTERS = { downloaded: false, unread: false };
const DEFAULT_DISPLAY = { sourceTitle: false, chapterNumber: false };

// Throttle auto-refetch per novel so rapid open → back → open doesn't hit the network; manual refresh bypasses it.

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
  const downloadChapter = useStore((s) => s.downloadChapter);
  const downloadMany = useStore((s) => s.downloadMany);
  const removeDownload = useStore((s) => s.removeDownload);

  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chaptersLoaded, setChaptersLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Restore saved per-novel list settings synchronously from the in-memory cache so a returning novel shows them on first render.
  const initialPrefs = getCachedChapterPrefs(novelId);
  const [filters, setFilters] = useState(initialPrefs?.filters ?? DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState(initialPrefs?.sortKey ?? 'numberAsc');
  const [display, setDisplay] = useState(initialPrefs?.display ?? DEFAULT_DISPLAY);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Last-persisted snapshot, seeded from the restored state; only written to AsyncStorage when settings actually change.
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

  // Refresh spinner; the ref guard prevents a second request while one is in flight.
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  // Set on unmount so late async work (DB reads, slow network fetches) skips state updates and DB writes.
  const cancelledRef = useRef(false);

  // Live mirror of the loaded novel for stable callbacks (memoised ChapterRow) that still read the current title.
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
        // Bail before the (potentially large) chapter rewrite if the screen closed while the fetch was in flight.
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
        markFetched(novelId);
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
      // Novel read and chapter-prefs load run together; the chapter list streams in behind the header without a gate.
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
      // Skip the network round-trip within the throttle window so rapid open → back → open doesn't re-clog the DB queue.
      if (base && shouldFetch(novelId)) {
        fetchRemote(base);
      }
    })();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
    };
  }, [novelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload chapters when the screen regains focus (e.g. returning from the
  // reader after marking chapters as read). Without this the in-memory chapter
  // list is stale and the unread filter shows incorrect results.
  useFocusEffect(
    useCallback(() => {
      if (!novelId || !chaptersLoaded) return;
      db.getChapters(novelId).then((list) => {
        if (!cancelledRef.current) setChapters(list);
      }).catch(() => {});
    }, [novelId, chaptersLoaded]),
  );

  /* ---------- derived chapter data (computed once per input change) ---------- */

  // Filter, then sort; display preferences apply at render time so toggling them never re-sorts thousands of rows.
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

  // Resume target: last unfinished chapter, else first unread; uses only the existing reading-progress columns.
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

  // Lookup for O(selection size) instead of O(chapter count) below — matters on
  // novels with thousands of chapters where only a handful are ever selected.
  const chaptersById = useMemo(() => {
    const map = new Map();
    for (const c of chapters) map.set(c.id, c);
    return map;
  }, [chapters]);

  // Which bulk actions actually apply to the current selection — e.g. "Remove
  // download" only makes sense if at least one selected chapter is downloaded.
  const selectionFlags = useMemo(() => {
    let canDownload = false;
    let canRemoveDownload = false;
    let canMarkRead = false;
    let canMarkUnread = false;
    for (const id of selectedIds) {
      const c = chaptersById.get(id);
      if (!c) continue;
      if (c.downloaded) canRemoveDownload = true;
      else canDownload = true;
      if (c.read) canMarkUnread = true;
      else canMarkRead = true;
    }
    return { canDownload, canRemoveDownload, canMarkRead, canMarkUnread };
  }, [chaptersById, selectedIds]);

  /* ---------- selection ---------- */

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((chapterId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  // Android hardware back exits selection mode first, then lets the router handle navigation.
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

  // Selects every displayed chapter that ISN'T already selected — with 1 chapter
  // selected that's "all except this one"; with several it's "all except selected".
  // No separate anchor needed: the current selection itself is the exclusion set.
  const selectAllExcept = useCallback(() => {
    const excluded = selectedRef.current;
    const next = new Set(visibleRef.current.filter((c) => !excluded.has(c.id)).map((c) => c.id));
    setSelectedIds(next);
  }, []);

  // Available with exactly two selected: selects every displayed chapter between them, inclusive.
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

  // Long-press enters selection with that chapter selected; while already selecting,
  // it just toggles that chapter — selection tools work off the whole set from here.
  const longPressChapter = useCallback(
    (chapter) => {
      if (!selectingRef.current) {
        setSelecting(true);
        setSelectedIds(new Set([chapter.id]));
      } else {
        toggleSelect(chapter.id);
      }
    },
    [toggleSelect],
  );

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

  const bulkDownload = useCallback(async () => {
    // Skip already-downloaded chapters so the queue only gets what's actually missing.
    const list = selectedChapters().filter((c) => !c.downloaded);
    if (!list.length) {
      Alert.alert(t('md3.somethingWentWrong'), t('settingsStorage.cleanupSubtitle'));
      return;
    }
    const count = list.length;
    // Selection exits right away — the queue (lib/downloadQueue.js) owns the operation from here.
    // Each row's own spinner/clock icon (via downloadStates) shows real progress independently.
    exitSelect();
    await downloadMany(list);
    if (cancelledRef.current) return;
    showToast(t('selection.addedToDownloads', { count, plural: count === 1 ? '' : 's' }));
  }, [selectedChapters, downloadMany, exitSelect, t]);

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

  // Item offsets must include the header's measured height so the render window stays correct when scrolling a huge list.
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
          canDownload={selectionFlags.canDownload}
          canRemoveDownload={selectionFlags.canRemoveDownload}
          canMarkRead={selectionFlags.canMarkRead}
          canMarkUnread={selectionFlags.canMarkUnread}
          canSelectBetween={selectedIds.size === 2}
          onSelectAllExcept={selectAllExcept}
          onSelectBetween={selectBetween}
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
