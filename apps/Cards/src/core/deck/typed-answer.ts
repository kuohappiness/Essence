import type { ProblemCode } from './types.ts';

interface TypedAnswer {
  /** 比對用的答案；不能當打字答案、不拆開時是 null。 */
  typed: readonly string[] | null;
  problem: { code: ProblemCode; message: string; level?: 'error' } | null;
}

/**
 * 中翻英的答案格（打字）：好幾個正確答案用 | 分開（D-122），字數不同也收、不提示（畫線照第一個，D-237），每一段各自去掉格式與前後空白；`a|b` 也認得。指紋仍用整個答案格。
 * 先看整格（W6 §0-1、syntax.md §2-3）：換行、跳脫的管線、行內程式碼、公式；ASCII 的 [ ] < >（Obsidian 與 Markdown
 * 的連結或嵌入、角括號與參照式連結，字面的括號也一起不收）；任何位置不分大小寫的 http(s)://；全形的｜。
 * 都不能當打字答案，不拆開、typed 是 null（換行要在 trim 之前看；Codex 格式查核 F1、F2，L2 的 S1 與它的格式查核）。
 */
export function typedAnswer(answer: string, label = '中翻英'): TypedAnswer {
  const invalid = { code: 'typed-answer-invalid', message: label + '的答案只能是單行英文單字或片語，好幾個答案用 | 分開；不能有換行、連結、程式碼或公式', level: 'error' } as const;
  if (/[\r\n`$[\]<>｜]|\\\||https?:\/\//i.test(answer)) return { typed: null, problem: invalid };
  const typed = answer.split('|').map(part => part.replace(/\*\*|\*|_|==/g, '').trim());
  if (typed.some(part => !part || /\p{Script=Han}/u.test(part))) return { typed, problem: invalid };
  return { typed, problem: null };
}
