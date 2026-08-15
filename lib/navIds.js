/**
 * Lossless encoding for Honya identifiers embedded in expo-router hrefs.
 *
 * Novel and chapter ids are arbitrary strings (`pluginId::/path/…`) that can
 * contain Unicode (Arabic, CJK, …), literal percent escapes, slashes, spaces
 * and query characters. They are also the SQLite primary keys, so whatever a
 * screen reads back from the route must byte-for-byte match the stored id —
 * otherwise lookups like `db.getNovel(id)` return null and the user sees
 * "Novel not found".
 *
 * expo-router's href pipeline percent-decodes every dynamic route param twice:
 *   1. @react-navigation/core getStateFromPath  → decodeURIComponent(value)
 *   2. expo-router useLocalSearchParams         → decodeURIComponent(value)
 *
 * A single-encoded id therefore arrives in the screen as `decodeURIComponent(id)`,
 * which corrupts any id containing a percent sequence — the exact form Arabic,
 * Japanese, Chinese and Korean sites return for their URLs — and breaks the DB
 * lookup. Double-encoding at the push boundary makes those two decodes cancel
 * out, so `useLocalSearchParams` delivers the exact original id for ASCII and
 * Unicode ids alike. Screens must NOT decode again; `decodeNavParam` is a
 * passthrough that documents that contract.
 */
export const encodeNavParam = (id) => encodeURIComponent(encodeURIComponent(String(id ?? '')));

export const decodeNavParam = (param) => String(param ?? '');
