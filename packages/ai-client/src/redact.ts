// 金鑰的遮蔽（docs/tasks/ai-client.md〈3〉第 4 點、〈7〉第 8 點，L2 R1）：服務回送的字串裡出現金鑰就換成 ***。
// 結果、錯誤與進度事件共用這裡；串流的文字結尾像金鑰的開頭時先扣住，金鑰被切在兩段之間也接得起來。

/**
 * 8 個字以上的才遮（〈3〉第 4 點）：各家真的金鑰都是幾十個字；更短的是本機服務的假金鑰（例如 ollama），
 * 遮了會把模型回的正常文字改掉（L2 第二輪 延續 R1）。
 */
const MIN_SECRET_LENGTH = 8;
export const usable = (secrets: readonly string[]): string[] => secrets.filter(s => typeof s === 'string' && s.length >= MIN_SECRET_LENGTH);

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of usable(secrets)) out = out.split(secret).join('***');
  return out;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** 物件與陣列裡的每個字串都遮；回傳新的一份，不改原本的。 */
export function redactDeep<T>(value: T, secrets: readonly string[]): T {
  const list = usable(secrets);
  if (list.length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactText(v, list);
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * 串流文字的遮蔽：結尾可能是金鑰開頭的那幾個字先不交出，下一段來了再看；end() 交出剩下的。
 * 一般的文字結尾不是金鑰的開頭，不會被扣住，進度照常（L2 R1）。交出的每一段接起來，等於整段文字遮蔽後的結果。
 */
export class StreamRedactor {
  readonly #secrets: string[];
  #pending = '';
  #length = 0;

  constructor(secrets: readonly string[]) {
    this.#secrets = usable(secrets);
  }

  /** 已經交出的字數（UTF-16 單位）。 */
  get length(): number {
    return this.#length;
  }

  push(delta: string): string {
    this.#pending += delta;
    // 切點：結尾最長的一段「某把金鑰的開頭」之前；之後才完整出現的金鑰一定從切點以後開始。
    let cut = this.#pending.length;
    for (const secret of this.#secrets) {
      for (let k = Math.min(secret.length - 1, this.#pending.length); k > 0; k--) {
        if (this.#pending.endsWith(secret.slice(0, k))) {
          cut = Math.min(cut, this.#pending.length - k);
          break;
        }
      }
    }
    // 切點落在一把完整的金鑰中間時，移到它後面，金鑰整個一起遮。
    for (let moved = true; moved;) {
      moved = false;
      for (const secret of this.#secrets) {
        for (let i = this.#pending.indexOf(secret); i !== -1 && i < cut; i = this.#pending.indexOf(secret, i + secret.length)) {
          if (i + secret.length > cut) {
            cut = i + secret.length;
            moved = true;
          }
        }
      }
    }
    return this.#emit(cut);
  }

  end(): string {
    return this.#emit(this.#pending.length);
  }

  #emit(cut: number): string {
    const out = redactText(this.#pending.slice(0, cut), this.#secrets);
    this.#pending = this.#pending.slice(cut);
    this.#length += out.length;
    return out;
  }
}
