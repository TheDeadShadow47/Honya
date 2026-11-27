import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { useI18n } from '../hooks/useI18n';
import { resolveDocUri } from '../lib/documents';
import { clampPage, createPageGuard, nextScale } from '../lib/pdfNav';

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;

/**
 * Native-rendered PDF (PdfRenderer on Android, PDFKit on iOS): pages rasterise on demand and large
 * files never enter JS memory. On Android any native prop update re-runs `drawPdf()` (a full reload
 * at `page`), so props stay constant while reading: `page` is frozen at mount, `scale` moves only on
 * explicit zoom, and pinch/page events never feed back into props. Layout switches remount the view.
 */
const PdfReader = forwardRef(function PdfReader(
  { doc, palette, paged, initialPage = 1, topInset, bottomInset, onLoaded, onPage, onTap, onError },
  ref,
) {
  const { t } = useI18n();
  const pdfRef = useRef(null);
  const [scale, setScale] = useState(1); // prop value: moves only on explicit zoom
  const liveScale = useRef(1); // what the native view is really at (pinch included)
  const totalRef = useRef(doc.pageCount || 0);
  const guard = useRef(createPageGuard()).current;
  const [failed, setFailed] = useState(false);

  // Frozen until a layout switch remounts the native view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startPage = useMemo(() => initialPage, [paged]);
  const source = useMemo(() => ({ uri: resolveDocUri(doc.filePath), cache: false }), [doc.filePath]);

  useImperativeHandle(
    ref,
    () => ({
      goTo: (page) => {
        const p = clampPage(page, totalRef.current);
        if (p == null) return;
        guard.jumped(p, Date.now());
        pdfRef.current?.setPage(p);
        onPage?.(p, totalRef.current || undefined); // reflect the jump at once, the native echo is then deduplicated
      },
      zoom: (delta) => {
        const next = nextScale(liveScale.current, delta, MIN_SCALE, MAX_SCALE);
        liveScale.current = next;
        setScale(next);
      },
    }),
    [guard, onPage],
  );

  const handleError = useCallback(
    (e) => {
      setFailed(true);
      onError?.(e);
    },
    [onError],
  );
  const handleLoad = useCallback(
    (pages, _path, _size, toc) => {
      totalRef.current = pages;
      onLoaded?.({ pages, toc: toc ?? [] });
    },
    [onLoaded],
  );
  const handlePage = useCallback(
    (page, pages) => {
      if (pages) totalRef.current = pages;
      if (guard.accept(page, Date.now())) onPage?.(page, pages);
    },
    [guard, onPage],
  );
  const handleScale = useCallback((s) => {
    liveScale.current = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }, []);
  const handleTap = useCallback(() => onTap?.(), [onTap]);
  const indicator = useCallback(() => <ActivityIndicator color={palette.fg} />, [palette.fg]);
  const pdfStyle = useMemo(() => ({ flex: 1, backgroundColor: palette.bg }), [palette.bg]);

  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>{t('document.pdfError')}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: topInset + 28, paddingBottom: bottomInset + 40 }}>
      <Pdf
        // Layout orientation can't change on a live view, so a mode switch remounts at the current page.
        key={paged ? 'h' : 'v'}
        ref={pdfRef}
        source={source}
        page={startPage}
        scale={scale}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        horizontal={paged}
        enablePaging={paged}
        spacing={paged ? 0 : 8}
        fitPolicy={0}
        trustAllCerts={false}
        style={pdfStyle}
        renderActivityIndicator={indicator}
        onLoadComplete={handleLoad}
        onPageChanged={handlePage}
        onPageSingleTap={handleTap}
        onScaleChanged={handleScale}
        onError={handleError}
      />
    </View>
  );
});

export default memo(PdfReader);
