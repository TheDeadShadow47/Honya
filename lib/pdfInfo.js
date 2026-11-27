// Import-time inspection only: confirm the header and read Title/Author from the head and tail of
// the file, so large PDFs are never loaded into memory. Rendering is done natively by react-native-pdf.

/** True when `%PDF-` appears in the first 1 KiB (the spec allows a little leading junk). */
export function hasPdfHeader(headLatin1) {
  return String(headLatin1 ?? '').slice(0, 1024).includes('%PDF-');
}

function decodePdfString(raw) {
  let bytes = [];
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/\s+/g, '');
    const padded = hex.length % 2 ? `${hex}0` : hex;
    for (let i = 0; i < padded.length; i += 2) bytes.push(parseInt(padded.slice(i, i + 2), 16));
  } else {
    const body = raw.slice(1, -1);
    for (let i = 0; i < body.length; i += 1) {
      const c = body[i];
      if (c !== '\\') {
        bytes.push(body.charCodeAt(i) & 255);
        continue;
      }
      const n = body[i + 1];
      if (n === undefined) break;
      const simple = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (n in simple) {
        bytes.push(simple[n]);
        i += 1;
      } else if (/[0-7]/.test(n)) {
        const oct = body.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
        bytes.push(parseInt(oct, 8) & 255);
        i += oct.length;
      } else if (n === '\r' || n === '\n') {
        i += n === '\r' && body[i + 2] === '\n' ? 2 : 1; // line continuation
      } else {
        bytes.push(n.charCodeAt(0) & 255);
        i += 1;
      }
    }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s.trim();
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    try {
      return decodeURIComponent(bytes.slice(3).map((b) => `%${b.toString(16).padStart(2, '0')}`).join('')).trim();
    } catch {
      return '';
    }
  }
  return String.fromCharCode(...bytes).trim();
}

const STRING_RE = '(\\((?:\\\\[\\s\\S]|[^\\\\()])*\\)|<[0-9A-Fa-f\\s]*>)';

/**
 * Reads Title/Author from the document Info dictionary. Following the trailer's `/Info` reference
 * (rather than grepping for `/Title`) avoids picking up outline/bookmark titles. PDFs that keep
 * their Info dictionary inside a compressed object stream simply return `{}`.
 */
export function extractPdfInfo(scanLatin1) {
  const s = String(scanLatin1 ?? '');
  let ref = null;
  const re = /\/Info\s+(\d+)\s+(\d+)\s+R/g;
  let m;
  while ((m = re.exec(s))) ref = m; // the last trailer wins (incremental updates)
  if (!ref) return {};
  const objRe = new RegExp(`(?:^|[\\r\\n\\s])${ref[1]}\\s+${ref[2]}\\s+obj\\s*<<([\\s\\S]*?)>>\\s*(?:endobj|stream)`, 'g');
  let body = null;
  let o;
  while ((o = objRe.exec(s))) body = o[1];
  if (body == null) return {};
  const pick = (key) => {
    const mm = new RegExp(`/${key}\\s*${STRING_RE}`).exec(body);
    if (!mm) return undefined;
    const v = decodePdfString(mm[1]);
    return v || undefined;
  };
  return { title: pick('Title'), author: pick('Author') };
}
