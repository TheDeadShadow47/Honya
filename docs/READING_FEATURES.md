# Paged reading and local documents

## Paged reading mode
- Preference `readingMode` (`'scroll'` default | `'paged'`), stored with the other reader prefs. Switch it in
  Settings → Reader or in the reader's settings sheet.
- `components/PagedReader.js` lays the chapter out once off-screen with the live font size, line height, side
  padding and viewport size, then `lib/paginate.js` groups the **measured lines** into pages. Pages re-flow
  (debounced) when typography or screen size changes. Horizontal windowed `FlatList`; tap the outer 30% of the
  screen to turn pages, tap the middle for the chrome, or swipe. RTL chapters reverse page order.
- Progress is still a 0..1 chapter ratio (same DB column as scroll mode), so switching modes or reopening a chapter
  lands on the same text. Swiping past the first/last page moves to the previous/next chapter.
- The scroll reader code path is unchanged; it is only skipped when `readingMode === 'paged'`.

## Local EPUB / PDF
- Import: Library → document icon. Files are copied to `<documentDirectory>/documents/<id>/`; works offline.
- DB: `novels.kind` (`'novel'` | `'epub'` | `'pdf'`, default `'novel'` for every existing row), plus new
  `documents` and `bookmarks` tables. Documents are excluded from backups and the online update checker.
- EPUB (`lib/epub.js`, `components/EpubReader.js`): fflate + htmlparser2. Metadata, cover, spine and TOC (EPUB 3 nav /
  EPUB 2 NCX) are read at import; chapter text is extracted lazily per spine item and shown through the shared
  typography prefs (scroll or paged). DRM-protected and malformed files are rejected with a message.
- PDF (`components/PdfReader.js`): native rendering via `react-native-pdf`; zoom, page jump, last-page restore,
  outline as contents. Import only reads the head/tail 64 KB for Title/Author.
- Reading mode maps onto PDFs: continuous = vertical scroll, paged = horizontal snapping.

## Dependencies added
- `fflate` – pure-JS unzip for EPUB (no native code).
- `react-native-pdf` + `react-native-blob-util` (its required peer) – native PDF rendering. **Native modules: a new
  dev/EAS build is required; Expo Go and OTA updates cannot load them.**

## Limitations
- EPUB text is plain text: images, inline styling, tables layout and embedded fonts are not rendered.
- EPUB archives are held in memory while open (imports above 120 MB are refused).
- PDF: password-protected files are not supported; Title/Author are skipped when the Info dictionary is in a
  compressed object stream (filename is used instead); no text search or selection UI.
- Cover paths are stored as absolute file URIs; they can break if the OS relocates the app container (iOS).
- Page-layout verification needs a device: pagination maths is unit-tested, but rendering is not.

## Tests
`node scripts/test-paginate.js`, `test-epub.js`, `test-pdfinfo.js`, `test-documents-db.js` (needs Node ≥ 22.13), `test-pagecurl.js`, `test-pdfnav.js`, `test-covers.js`.

## Page-turn animation (1.5.0)
Optional paper-style page curl for paged mode (setting **Reader → Page-turn animation**, preference
`pageTurnAnimation`, **default off**; scroll mode is untouched).

- Interaction: where the finger lands picks the turn (LTR: right half grabs the current page to turn it forward,
  left half pulls the previous page back; RTL mirrored). The page then follows the finger continuously and the
  drag can be stopped, reversed or adjusted at any point (dragging back to the start restores the page).
  Forward: the finger holds the free corner, so the corner tracks it 1:1; backward: the finger holds the rolled
  edge, so the edge tracks it 1:1. The touch's vertical half picks the top or bottom corner and vertical travel
  lifts it. Release past 40% of the width of finger travel, or with a quick flick in the turning direction,
  commits; otherwise the page falls back. A tap (no movement) on the side zones plays the same curl from the
  bottom corner; it is separate from dragging. At a chapter boundary the revealed page is the chapter cell and
  completing hands over to the next/previous chapter. No page exists past the first/last page of the book, so
  that side cannot be grabbed. Touches are ignored while a turn settles.
- Implementation: `lib/pageCurl.js` (pure fold geometry, worklets) → `lib/curlGesture.js` (pure gesture state machine) → `components/PageCurl.js` (Reanimated shared
  values + gesture-handler Pan; React state changes only when a turn starts and ends) → `PagedReader` (shares
  `current`, pagination, progress and bookmarks; the FlatList path is used whenever the curl is off). The curl is
  a flat corner fold built from rotated clipped views, not a mesh: no Skia, shader or new dependency.
- Guards: one turn at a time (further touches are ignored until it settles); the curl is bypassed when the OS asks
  for reduced motion (plain animated swipe, instant when reduced).
- Rolled edge: the flat underside stops `pi*r/2` short of the fold and a band of width `r` (up to 7% of the page
  width, zero at the start and end of a turn) joins it to the page beneath, shaded like a cylinder; the turning
  page's text shows faintly mirrored through the back; the cast shadow fades as the curl leaves the screen. All
  of it is plain views driven by shared values (no Skia / GL). Compared with a GPU shader curl (e.g. Skia
  runtime shader) this has a straight roll axis and no perspective or per-pixel lighting, which is the cost of
  avoiding a large native dependency that could not be tested here.
- Limitations: no perspective or per-pixel lighting; the flap shows page text only as a faint ghost. **Not verified on a device or emulator** —
  geometry is unit-tested (`node scripts/test-pagecurl.js`) and a browser render of the same numbers was
  inspected, but frame rate and touch feel on real Android hardware are untested.

## PDF scrolling stability (1.5.0)
Cause: on Android `react-native-pdf`'s native view runs `drawPdf()` (a full reload at its `page` prop) after
**any** native prop update. The screen fed every page change (`pdfPage`) and every pinch (`scale`) back into
the `<Pdf>` props, so scrolling reloaded the document at the top of the page it had just reported (and late
events dragged it back). Fix (`components/PdfReader.js`, `lib/pdfNav.js`): `page` is frozen at mount (re-read only
on a layout switch, which remounts anyway); intentional navigation uses imperative `setPage` (jump only);
`scale` changes only on the zoom buttons while pinch is tracked in a ref; stale page events right after a jump
are filtered; the component is memoised with stable props so page events do not re-render it. Saved position
is written debounced and is never read back while the view is mounted. Limitation: tapping the zoom buttons
still changes the `scale` prop, which makes the native view reload at the current page (intra-page offset is
lost for that action only); position restore on reopen is per page, not per offset.

## Covers for local documents (1.5.0)
- PDF: `lib/covers.js` renders page 1 with `react-native-pdf-thumbnail` (PdfRenderer / PDFKit, max width 540,
  JPEG) into `documents/<id>/cover.jpg`; an existing non-empty file is reused; failure leaves no cover and never
  fails the import. Opening an older PDF with a missing cover file regenerates it (`ensureDocumentCover`).
- EPUB: embedded cover metadata first (verified by magic bytes); otherwise the first sizeable (>= 4 KB) local
  image used by the first 3 spine sections (`<img>` or SVG `<image>`); remote/data images are ignored.
- Covers are stored as absolute file URIs under the app's document directory (restart-safe on Android; the iOS
  container path can change between app updates, as noted above). There is no separate document-details screen
  in this app; covers appear on library cards.
- **Native build:** `react-native-pdf-thumbnail` is a native (TurboModule) dependency: a new dev build / EAS build is
  required (as for `react-native-pdf`); Expo Go and OTA updates cannot provide it, and without it PDFs simply have no cover.

## Page-curl drag fix (why forward felt like a tap)
Both directions share one Pan gesture, so the difference was in how it was built and classified:
1. The direction was decided from the first few pixels of motion (`translationX` at activation, with a 4 px
   `minDistance` that also activates on vertical movement); a tie or a rightward jitter at the start locked a
   forward drag into the *backward* turn, whose progress is clamped at 0 for leftward motion: nothing moved,
   so only the tap zone worked. Now the touch-down position decides.
2. The gesture object was rebuilt whenever a dependency changed identity. The first drag with the toolbar open
   calls `onDragStart` (hides the toolbar), which re-renders the screen and rebuilt the gesture mid-drag,
   cancelling it. It is now built once and reads size/direction/neighbours from shared values.
3. The backward curl moved at half the finger's speed, so it felt looser than forward; its edge now tracks the finger.
Verified by simulating the pointer events against the state machine (`node scripts/test-curlgesture.js`);
**not verified on a device** — only a physical Android phone can confirm that touches reach the gesture, that
the system back gesture does not claim the screen edge, and how the drag feels.
