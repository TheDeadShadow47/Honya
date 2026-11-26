import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useI18n } from '../hooks/useI18n';
import { loadEpubSection } from '../lib/documents';
import { isArabicText } from '../lib/i18n';
import PagedReader from './PagedReader';

/**
 * Reflowable EPUB reader: one spine section is loaded lazily at a time. Position is
 * `{ section, ratio }` (0..1 inside that section); `jump` lets the parent navigate via TOC/bookmarks.
 */
export default function EpubReader({
  doc,
  prefs,
  palette,
  titleFor,
  initialPosition,
  jump,
  topInset,
  bottomInset,
  chromeOpen,
  onPosition,
  onTap,
  onDragStart,
}) {
  const { t } = useI18n();
  const count = doc.spine.length;
  const [nav, setNav] = useState(() => ({
    section: Math.min(Math.max(initialPosition?.section ?? 0, 0), count - 1),
    ratio: initialPosition?.ratio ?? 0,
    startAtEnd: false,
    seq: 0,
  }));
  const [content, setContent] = useState(null); // { section, text, rtl, anchors }
  const [error, setError] = useState(null);
  const [lastJump, setLastJump] = useState(jump?.nonce);

  // Applied while rendering rather than in an effect so a new jump nonce takes effect immediately.
  if (jump && jump.nonce !== lastJump) {
    setLastJump(jump.nonce);
    setNav((n) => ({
      section: Math.min(Math.max(jump.section ?? 0, 0), count - 1),
      ratio: jump.ratio ?? 0,
      fragment: jump.fragment ?? null,
      startAtEnd: false,
      seq: n.seq + 1,
    }));
  }

  // Load the requested section; a TOC fragment is turned into a position once the text is known.
  useEffect(() => {
    let alive = true;
    loadEpubSection(doc, nav.section)
      .then(({ text, anchors }) => {
        if (!alive) return;
        const body = text.trim() ? text : t('document.emptySection');
        const off = nav.fragment ? anchors?.[nav.fragment] : null;
        setError(null);
        setContent({
          section: nav.section,
          seq: nav.seq,
          text: body,
          rtl: doc.rtl || isArabicText(body),
          startRatio: off != null ? off / Math.max(body.length, 1) : nav.ratio,
        });
      })
      .catch((e) => alive && setError(e?.message || 'error'));
    return () => {
      alive = false;
    };
  }, [doc, nav, t]);

  const report = useCallback(
    (section, ratio) => {
      onPosition?.({ section, ratio }, (section + ratio) / count);
    },
    [count, onPosition],
  );

  const onPageChange = useCallback(({ ratio }) => report(nav.section, ratio), [report, nav.section]);
  const onEdge = useCallback(
    (dir) => {
      if (dir === 'next' && nav.section < count - 1) setNav({ section: nav.section + 1, ratio: 0, startAtEnd: false, seq: nav.seq + 1 });
      else if (dir === 'prev' && nav.section > 0) setNav({ section: nav.section - 1, ratio: 0, startAtEnd: true, seq: nav.seq + 1 });
    },
    [nav, count],
  );

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>{t('document.sectionError')}</Text>
        <Text style={{ color: palette.fg, opacity: 0.6, marginTop: 8, textAlign: 'center', fontSize: 12 }}>{String(error)}</Text>
      </View>
    );
  }
  if (!content || content.section !== nav.section || content.seq !== nav.seq) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.fg} />
      </View>
    );
  }

  const name = titleFor(nav.section);

  if (prefs.readingMode === 'paged') {
    return (
      <PagedReader
        key={`${nav.section}:${nav.seq}`}
        text={content.text}
        rtl={content.rtl}
        palette={palette}
        fontSize={prefs.fontSize}
        lineHeight={prefs.lineHeight}
        horizontalPadding={prefs.horizontalPadding}
        chapterName={name}
        initialRatio={content.startRatio}
        startAtEnd={nav.startAtEnd}
        hasPrev={nav.section > 0}
        hasNext={nav.section < count - 1}
        topInset={topInset}
        bottomInset={bottomInset}
        chromeOpen={chromeOpen}
        onPageChange={onPageChange}
        onEdge={onEdge}
        onTap={onTap}
        onDragStart={onDragStart}
      />
    );
  }

  return (
    <ScrollSection
      key={`${nav.section}:${nav.seq}`}
      content={content}
      name={name}
      prefs={prefs}
      palette={palette}
      initialRatio={nav.startAtEnd ? 1 : content.startRatio}
      topInset={topInset}
      bottomInset={bottomInset}
      hasPrev={nav.section > 0}
      hasNext={nav.section < count - 1}
      onRatio={(r) => report(nav.section, r)}
      onEdge={onEdge}
      onTap={onTap}
      onDragStart={onDragStart}
      t={t}
    />
  );
}

function ScrollSection({ content, name, prefs, palette, initialRatio, topInset, bottomInset, hasPrev, hasNext, onRatio, onEdge, onTap, onDragStart, t }) {
  const ref = useRef(null);
  const dims = useRef({ h: 0, content: 0, restored: false });
  const touch = useRef(null);

  const apply = () => {
    const d = dims.current;
    if (d.restored || !d.h || !d.content) return;
    d.restored = true;
    const max = Math.max(d.content - d.h, 0);
    if (initialRatio > 0 && max > 0) ref.current?.scrollTo({ y: initialRatio * max, animated: false });
  };

  const onScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(contentSize.height - layoutMeasurement.height, 0);
    if (!dims.current.restored) return;
    onRatio(max > 0 ? Math.min(Math.max(contentOffset.y / max, 0), 1) : 1);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      scrollEventThrottle={120}
      onScroll={onScroll}
      onScrollBeginDrag={onDragStart}
      onLayout={(e) => {
        dims.current.h = e.nativeEvent.layout.height;
        apply();
      }}
      onContentSizeChange={(_, h) => {
        dims.current.content = h;
        apply();
      }}
      onTouchStart={(e) => {
        const p = e.nativeEvent.touches?.[0];
        touch.current = p ? { x: p.pageX, y: p.pageY, t: Date.now() } : null;
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        const p = e.nativeEvent.changedTouches?.[0];
        touch.current = null;
        if (s && p && Date.now() - s.t < 350 && Math.abs(p.pageX - s.x) < 10 && Math.abs(p.pageY - s.y) < 10) onTap?.();
      }}
      contentContainerStyle={{ paddingTop: topInset + 28, paddingBottom: bottomInset + 40, paddingHorizontal: prefs.horizontalPadding }}
    >
      <Text style={{ color: palette.fg, opacity: 0.65, fontSize: 13, marginBottom: 18, textAlign: content.rtl ? 'right' : 'left' }}>{name}</Text>
      <Text
        style={{
          color: palette.fg,
          fontSize: prefs.fontSize,
          lineHeight: prefs.fontSize * prefs.lineHeight,
          writingDirection: content.rtl ? 'rtl' : 'ltr',
          textAlign: content.rtl ? 'right' : 'left',
        }}
      >
        {content.text}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 }}>
        {hasPrev ? <EdgeButton label={t('reader.previousChapter')} color={palette.fg} onPress={() => onEdge('prev')} /> : <View />}
        {hasNext ? <EdgeButton label={t('reader.nextChapter')} color={palette.fg} onPress={() => onEdge('next')} /> : <View />}
      </View>
    </ScrollView>
  );
}

function EdgeButton({ label, color, onPress }) {
  return (
    <Text onPress={onPress} style={{ color, fontWeight: '700', fontSize: 14, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: color + '44', borderRadius: 12 }}>
      {label}
    </Text>
  );
}
