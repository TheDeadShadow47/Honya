import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StatusBar, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useI18n } from '../../hooks/useI18n';
import * as db from '../../db/database';
import { decodeNavParam } from '../../lib/navIds';
import { RADIUS, READER_BACKGROUNDS } from '../../theme/theme';
import BottomSheet from '../../components/BottomSheet';
import Ripple from '../../components/Ripple';
import { Chip, Field } from '../../components/MD3';
import EpubReader from '../../components/EpubReader';
import PdfReader from '../../components/PdfReader';
import { ensureDocumentCover } from '../../lib/documents';

const SAVE_DEBOUNCE_MS = 800;

function BarButton({ icon, onPress, color, disabled, label }) {
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden', opacity: disabled ? 0.35 : 1 }}>
      <Ripple onPress={onPress} disabled={disabled} borderless accessibilityLabel={label}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
      </Ripple>
    </View>
  );
}

export default function DocumentReaderScreen() {
  const { id } = useLocalSearchParams();
  const novelId = decodeNavParam(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { t } = useI18n();
  const prefs = useStore((s) => s.prefs);
  const setPref = useStore((s) => s.setPref);
  const refreshLibrary = useStore((s) => s.refreshLibrary);
  const palette = READER_BACKGROUNDS.find((b) => b.key === prefs.readerBackground) ?? READER_BACKGROUNDS[1];

  const [novel, setNovel] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [uiVisible, setUiVisible] = useState(true);
  const [sheet, setSheet] = useState(null); // 'toc' | 'bookmarks' | 'settings' | 'goto'
  const [jump, setJump] = useState(null);
  const [epubPos, setEpubPos] = useState(null); // { section, ratio }
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfStart, setPdfStart] = useState(1); // page the native PDF view is (re)mounted on; moves only on load / layout switch
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfToc, setPdfToc] = useState([]);
  const [gotoText, setGotoText] = useState('');
  const pdfRef = useRef(null);
  const nonceRef = useRef(0);
  const nextNonce = () => {
    nonceRef.current += 1;
    return nonceRef.current;
  };

  const saveTimer = useRef(null);
  const pending = useRef(null); // { position, progress }

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) db.saveDocumentPosition(novelId, p.position, p.progress).catch(() => {});
  }, [novelId]);

  const queueSave = useCallback(
    (position, progress) => {
      pending.current = { position, progress };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [n, d, b] = await Promise.all([db.getNovel(novelId), db.getDocument(novelId), db.getBookmarks(novelId)]);
        if (!alive) return;
        if (!n || !d) {
          setLoadError(true);
          return;
        }
        setNovel(n);
        setDoc(d);
        setBookmarks(b);
        // Backfill/repair a missing PDF cover in the background; independent of reading state.
        ensureDocumentCover(n, d)
          .then((uri) => {
            if (uri && uri !== n.cover) refreshLibrary();
          })
          .catch(() => {});
        if (d.format === 'epub') setEpubPos({ section: d.position?.section ?? 0, ratio: d.position?.ratio ?? 0 });
        else {
          setPdfPage(d.position?.page ?? 1);
          setPdfStart(d.position?.page ?? 1);
          if (d.pageCount) setPdfPages(d.pageCount);
        }
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [novelId, refreshLibrary]);

  useEffect(
    () => () => {
      flush();
      refreshLibrary();
    },
    [flush, refreshLibrary],
  );

  const isPdf = doc?.format === 'pdf';
  const paged = prefs.readingMode === 'paged';

  // A layout switch rebuilds the PDF view, so it must restart on the page being read right now.
  const changeMode = (mode) => {
    setPdfStart(pdfPage);
    setPref('readingMode', mode);
  };

  const tocEntries = useMemo(() => {
    if (!doc) return [];
    if (!isPdf) return doc.toc;
    return pdfToc.map((e) => ({ title: e.title, page: (e.pageIdx ?? 0) + 1, depth: Math.max(0, (e.depth ?? 0)) }));
  }, [doc, isPdf, pdfToc]);

  const titleFor = useCallback(
    (section) => {
      if (!doc) return '';
      let best = null;
      for (const e of doc.toc) if (e.spineIndex <= section) best = e;
      return best?.title || novel?.title || '';
    },
    [doc, novel],
  );

  const onEpubPosition = useCallback(
    (pos, progress) => {
      setEpubPos(pos);
      queueSave(pos, progress);
    },
    [queueSave],
  );

  const onPdfPage = useCallback(
    (page, pages) => {
      setPdfPage(page);
      if (pages) setPdfPages(pages);
      queueSave({ page }, pages ? Math.min(page / pages, 1) : 0);
    },
    [queueSave],
  );

  const onPdfLoaded = useCallback(
    ({ pages, toc }) => {
      setPdfPages(pages);
      setPdfToc(toc);
      if (pages !== doc?.pageCount) db.updateDocumentMeta(novelId, { pageCount: pages }).catch(() => {});
    },
    [doc, novelId],
  );

  const currentBookmark = useMemo(() => {
    if (!doc) return null;
    if (isPdf) return bookmarks.find((b) => b.page === pdfPage) ?? null;
    if (!epubPos) return null;
    return bookmarks.find((b) => b.chapter === epubPos.section && Math.abs((b.ratio ?? 0) - epubPos.ratio) < 0.03) ?? null;
  }, [bookmarks, doc, isPdf, pdfPage, epubPos]);

  const toggleBookmark = useCallback(async () => {
    try {
      if (currentBookmark) await db.removeBookmark(currentBookmark.id);
      else if (isPdf) await db.addBookmark(novelId, { page: pdfPage, label: t('document.pageLabel', { page: pdfPage }) });
      else if (epubPos) await db.addBookmark(novelId, { chapter: epubPos.section, ratio: epubPos.ratio, label: titleFor(epubPos.section) });
      setBookmarks(await db.getBookmarks(novelId));
    } catch {
      Alert.alert(t('document.bookmarkError'));
    }
  }, [currentBookmark, isPdf, novelId, pdfPage, epubPos, titleFor, t]);

  const openBookmark = (b) => {
    setSheet(null);
    if (isPdf) pdfRef.current?.goTo(b.page);
    else setJump({ section: b.chapter, ratio: b.ratio ?? 0, nonce: nextNonce() });
  };

  const openToc = (e) => {
    setSheet(null);
    if (isPdf) pdfRef.current?.goTo(e.page);
    else setJump({ section: e.spineIndex, fragment: e.fragment, nonce: nextNonce() });
  };

  const submitGoto = () => {
    const n = parseInt(gotoText, 10);
    if (!Number.isFinite(n) || n < 1 || (pdfPages && n > pdfPages)) {
      Alert.alert(t('document.invalidPage', { total: pdfPages || '?' }));
      return;
    }
    setSheet(null);
    setGotoText('');
    pdfRef.current?.goTo(n);
  };

  const stepSection = (delta) => {
    if (!epubPos || !doc) return;
    const section = Math.min(Math.max(epubPos.section + delta, 0), doc.spine.length - 1);
    setJump({ section, ratio: 0, nonce: nextNonce() });
  };

  const onTap = useCallback(() => {
    if (sheet) return;
    setUiVisible((v) => !v);
  }, [sheet]);
  const onDragStart = useCallback(() => setUiVisible(false), []);

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>{t('document.loadError')}</Text>
        <Text onPress={() => router.back()} style={{ color: palette.fg, marginTop: 18, fontWeight: '700' }}>
          {t('document.back')}
        </Text>
      </View>
    );
  }
  if (!doc || !novel) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.fg} />
      </View>
    );
  }

  const progressLabel = isPdf
    ? pdfPages
      ? t('reader.pageOf', { page: pdfPage, total: pdfPages })
      : ''
    : epubPos
      ? t('document.sectionOf', { n: epubPos.section + 1, total: doc.spine.length })
      : '';
  const barBg = palette.bg;
  const border = palette.fg + '22';

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar hidden={!uiVisible} />

      {isPdf ? (
        <PdfReader
          ref={pdfRef}
          doc={doc}
          palette={palette}
          paged={paged}
          initialPage={pdfStart}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onLoaded={onPdfLoaded}
          onPage={onPdfPage}
          onTap={onTap}
        />
      ) : (
        <EpubReader
          doc={doc}
          prefs={prefs}
          palette={palette}
          titleFor={titleFor}
          initialPosition={epubPos}
          jump={jump}
          topInset={insets.top}
          bottomInset={insets.bottom}
          chromeOpen={uiVisible || !!sheet}
          onPosition={onEpubPosition}
          onTap={onTap}
          onDragStart={onDragStart}
        />
      )}

      {uiVisible ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingTop: insets.top,
              backgroundColor: barBg,
              borderBottomWidth: 1,
              borderBottomColor: border,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 6,
            }}
          >
            <BarButton icon="arrow-back" color={palette.fg} onPress={() => router.back()} label={t('document.back')} />
            <View style={{ flex: 1, marginHorizontal: 6 }}>
              <Text numberOfLines={1} style={{ color: palette.fg, fontWeight: '700', fontSize: 15 }}>
                {novel.title}
              </Text>
              {novel.author ? (
                <Text numberOfLines={1} style={{ color: palette.fg, opacity: 0.65, fontSize: 12, marginTop: 1 }}>
                  {novel.author}
                </Text>
              ) : null}
            </View>
            <BarButton
              icon={currentBookmark ? 'bookmark' : 'bookmark-outline'}
              color={palette.fg}
              onPress={toggleBookmark}
              label={t('document.bookmarkToggle')}
            />
            <BarButton icon="list" color={palette.fg} onPress={() => setSheet('toc')} label={t('document.contents')} />
            <BarButton icon="text" color={palette.fg} onPress={() => setSheet('settings')} label={t('reader.settings')} />
          </View>

          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: insets.bottom,
              backgroundColor: barBg,
              borderTopWidth: 1,
              borderTopColor: border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 6,
            }}
          >
            {isPdf ? (
              <>
                <BarButton icon="remove-circle-outline" color={palette.fg} onPress={() => pdfRef.current?.zoom(-0.5)} label={t('document.zoomOut')} />
                <BarButton icon="chevron-back" color={palette.fg} disabled={pdfPage <= 1} onPress={() => pdfRef.current?.goTo(pdfPage - 1)} label={t('document.prevPage')} />
                <Text onPress={() => setSheet('goto')} style={{ color: palette.fg, fontWeight: '700', fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 }}>
                  {progressLabel}
                </Text>
                <BarButton icon="chevron-forward" color={palette.fg} disabled={!pdfPages || pdfPage >= pdfPages} onPress={() => pdfRef.current?.goTo(pdfPage + 1)} label={t('document.nextPage')} />
                <BarButton icon="add-circle-outline" color={palette.fg} onPress={() => pdfRef.current?.zoom(0.5)} label={t('document.zoomIn')} />
              </>
            ) : (
              <>
                <BarButton icon="play-skip-back" color={palette.fg} disabled={!epubPos || epubPos.section <= 0} onPress={() => stepSection(-1)} label={t('reader.previousChapter')} />
                <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14 }}>{progressLabel}</Text>
                <BarButton icon="play-skip-forward" color={palette.fg} disabled={!epubPos || epubPos.section >= doc.spine.length - 1} onPress={() => stepSection(1)} label={t('reader.nextChapter')} />
              </>
            )}
          </View>
        </>
      ) : null}

      <BottomSheet visible={sheet === 'toc' || sheet === 'bookmarks'} onDismiss={() => setSheet(null)} maxHeight="75%">
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Chip label={t('document.contents')} icon="list" selected={sheet === 'toc'} onPress={() => setSheet('toc')} />
          <Chip label={`${t('document.bookmarks')} (${bookmarks.length})`} icon="bookmark" selected={sheet === 'bookmarks'} onPress={() => setSheet('bookmarks')} />
        </View>
        {sheet === 'bookmarks' ? (
          <FlatList
            data={bookmarks}
            keyExtractor={(b) => String(b.id)}
            ListEmptyComponent={<Text style={{ color: theme.textMuted, paddingVertical: 24, textAlign: 'center' }}>{t('document.noBookmarks')}</Text>}
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Ripple onPress={() => openBookmark(item)}>
                    <View style={{ paddingVertical: 12 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600', fontSize: 14.5 }}>
                        {item.label || (item.page ? t('document.pageLabel', { page: item.page }) : t('document.bookmarks'))}
                      </Text>
                      {!isPdf ? (
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{Math.round((item.ratio ?? 0) * 100)}%</Text>
                      ) : null}
                    </View>
                  </Ripple>
                </View>
                <BarButton
                  icon="trash-outline"
                  color={theme.textMuted}
                  label={t('document.removeBookmark')}
                  onPress={async () => {
                    await db.removeBookmark(item.id);
                    setBookmarks(await db.getBookmarks(novelId));
                  }}
                />
              </View>
            )}
          />
        ) : (
          <FlatList
            data={tocEntries}
            keyExtractor={(e, i) => `${i}:${e.title}`}
            ListEmptyComponent={<Text style={{ color: theme.textMuted, paddingVertical: 24, textAlign: 'center' }}>{t('document.noContents')}</Text>}
            renderItem={({ item }) => (
              <Ripple onPress={() => openToc(item)}>
                <View style={{ paddingVertical: 12, paddingLeft: Math.min(item.depth, 4) * 16 }}>
                  <Text numberOfLines={2} style={{ color: theme.text, fontSize: 14.5, fontWeight: item.depth ? '500' : '700' }}>
                    {item.title}
                  </Text>
                </View>
              </Ripple>
            )}
          />
        )}
      </BottomSheet>

      <BottomSheet visible={sheet === 'goto'} onDismiss={() => setSheet(null)}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 10 }}>{t('document.goToPage')}</Text>
        <Field value={gotoText} onChangeText={setGotoText} placeholder={`1 – ${pdfPages || '?'}`} onSubmitEditing={submitGoto} returnKeyType="go" autoFocus />
      </BottomSheet>

      {/* Typography — the same shared preferences the online reader uses */}
      <BottomSheet visible={sheet === 'settings'} onDismiss={() => setSheet(null)} maxHeight="85%">
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 10 }}>{t('reader.settings')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip icon="swap-vertical-outline" label={t('settingsReader.modeScroll')} selected={!paged} onPress={() => changeMode('scroll')} />
          <Chip icon="swap-horizontal-outline" label={t('settingsReader.modePaged')} selected={paged} onPress={() => changeMode('paged')} />
        </View>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13, marginTop: 10 }}>{t('reader.background')}</Text>
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
                  borderColor: prefs.readerBackground === b.key ? theme.primary : theme.outline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: b.fg, fontWeight: '800' }}>A</Text>
              </View>
            </Ripple>
          ))}
        </View>
        {isPdf ? (
          <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 14, lineHeight: 18 }}>{t('document.pdfSettingsNote')}</Text>
        ) : (
          <>
            {[
              { key: 'fontSize', label: t('reader.fontSize'), min: 12, max: 32, step: 1, fmt: (v) => v },
              { key: 'lineHeight', label: t('reader.lineHeight'), min: 1.2, max: 2.4, step: 0.1, fmt: (v) => v.toFixed(1) },
              { key: 'horizontalPadding', label: t('reader.sidePadding'), min: 8, max: 48, step: 2, fmt: (v) => v },
            ].map((s) => (
              <View key={s.key}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13, marginTop: 12 }}>
                  {s.label} · {s.fmt(prefs[s.key])}
                </Text>
                <Slider
                  minimumValue={s.min}
                  maximumValue={s.max}
                  step={s.step}
                  value={prefs[s.key]}
                  onValueChange={(v) => setPref(s.key, s.key === 'lineHeight' ? Math.round(v * 10) / 10 : Math.round(v))}
                  minimumTrackTintColor={theme.primary}
                  maximumTrackTintColor={theme.outline}
                  thumbTintColor={theme.primary}
                />
              </View>
            ))}
          </>
        )}
      </BottomSheet>
    </View>
  );
}
