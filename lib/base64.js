// Pure JS so behaviour matches under Hermes and node; decoding tolerates line breaks from native APIs.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Decodes base64 (ignoring whitespace, padding and unknown characters) into bytes. */
export function base64ToBytes(b64) {
  const input = String(b64 ?? '');
  const out = new Uint8Array(Math.ceil((input.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < input.length; i += 1) {
    const v = LOOKUP[input.charCodeAt(i) & 255];
    if (v === 255) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 255;
      buffer &= (1 << bits) - 1;
    }
  }
  return out.subarray(0, o);
}

/** For small payloads such as cover images. */
export function bytesToBase64(bytes) {
  const parts = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    let s = '';
    for (let i = start; i < end; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      s += ALPHABET[b0 >> 2] + ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
      s += i + 1 < bytes.length ? ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      s += i + 2 < bytes.length ? ALPHABET[b2 & 63] : '=';
    }
    parts.push(s);
  }
  return parts.join('');
}

/** Latin-1 string from bytes (one char per byte), used to scan binary files for ASCII markers. */
export function bytesToLatin1(bytes) {
  let s = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return s;
}
