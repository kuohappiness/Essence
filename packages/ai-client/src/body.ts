// 請求本文直接組成位元組：檔案的 base64 不經過 JS 字串，50 MB 的 PDF 峰值約是檔案的 2.3 倍，
// 不是先組字串再編碼的 4～5 倍（手機要用）。方言在本文裡放 Binary，encodeBody 在那個位置寫進 "前綴＋base64"。

/** 本文裡的一段檔案內容：序列化成 JSON 字串 "<prefix><base64>"。 */
export class Binary {
  readonly bytes: Uint8Array;
  readonly prefix: string;
  constructor(bytes: Uint8Array, prefix = '') {
    this.bytes = bytes;
    this.prefix = prefix;
  }
}

export const dataUrl = (mediaType: string, bytes: Uint8Array): Binary => new Binary(bytes, `data:${mediaType};base64,`);

const ALPHABET = new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
const PAD = 61; // '='

const base64Length = (byteLength: number): number => Math.ceil(byteLength / 3) * 4;

/** 把 bytes 的 base64 寫進 out 的 offset 起，回傳寫完的位置。 */
function writeBase64(bytes: Uint8Array, out: Uint8Array, offset: number): number {
  let o = offset;
  const full = bytes.length - (bytes.length % 3);
  for (let i = 0; i < full; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out[o++] = ALPHABET[n >> 18];
    out[o++] = ALPHABET[(n >> 12) & 63];
    out[o++] = ALPHABET[(n >> 6) & 63];
    out[o++] = ALPHABET[n & 63];
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = bytes[full] << 16;
    out[o++] = ALPHABET[n >> 18];
    out[o++] = ALPHABET[(n >> 12) & 63];
    out[o++] = PAD;
    out[o++] = PAD;
  } else if (rest === 2) {
    const n = (bytes[full] << 16) | (bytes[full + 1] << 8);
    out[o++] = ALPHABET[n >> 18];
    out[o++] = ALPHABET[(n >> 12) & 63];
    out[o++] = ALPHABET[(n >> 6) & 63];
    out[o++] = PAD;
  }
  return o;
}

/** 本文 → UTF-8 位元組。Binary 以外的值照 JSON.stringify。 */
export function encodeBody(body: unknown): Uint8Array {
  const binaries: Binary[] = [];
  const nonce = Math.random().toString(36).slice(2, 10);
  const marker = (i: number) => `\u0000ai-client-${nonce}-${i}\u0000`;
  const json = JSON.stringify(body, (_key, value: unknown) => {
    if (value instanceof Binary) {
      binaries.push(value);
      return marker(binaries.length - 1);
    }
    return value;
  });
  const encoder = new TextEncoder();
  if (binaries.length === 0) return encoder.encode(json);
  // JSON.stringify 把 \u0000 寫成六個字元的跳脫，使用者的文字裡就算有同樣的字也不會撞到。
  const quoted = binaries.map((_, i) => JSON.stringify(marker(i)));
  const segments: (string | Binary)[] = [];
  let rest = json;
  for (let i = 0; i < binaries.length; i++) {
    const at = rest.indexOf(quoted[i]);
    if (at === -1) throw new Error('binary marker not found');
    segments.push(rest.slice(0, at), binaries[i]);
    rest = rest.slice(at + quoted[i].length);
  }
  segments.push(rest);
  const encoded = segments.map(s => (typeof s === 'string' ? encoder.encode(s) : s));
  let size = 0;
  for (const s of encoded) size += s instanceof Binary ? 2 + encoder.encode(s.prefix).length + base64Length(s.bytes.length) : s.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const s of encoded) {
    if (s instanceof Binary) {
      out[offset++] = 34; // "
      const prefix = encoder.encode(s.prefix);
      out.set(prefix, offset);
      offset = writeBase64(s.bytes, out, offset + prefix.length);
      out[offset++] = 34;
    } else {
      out.set(s, offset);
      offset += s.length;
    }
  }
  return out;
}
