// 比較測試工具：從 AI 的回覆切出給評審的卡組段（任務說明 tasks/rule-test-tool.md §5-6，第一輪 anon.mjs 的切法），
// 與「有效原稿」的定義（§4-2：有 `<<<完>>>`、卡組段不是空的）。字一個不改：只切段、拿掉外層程式碼框的頭尾一行、統一換行。
const END = '<<<完>>>';
const DECK = '<<<卡組>>>';
const OPEN_FENCE = /^\s*(```+|~~~+)\w*\s*$/;
// 結尾的框線要頂格：卡組裡的程式碼區塊縮排在目標底下，不會被當成外層的框（第一輪的寫法允許縮排，這裡收窄）。
const CLOSE_FENCE = /^(```+|~~~+)\s*$/;

export type Cut = { ok: true; deck: string } | { ok: false; why: string };

/**
 * 三段的只留 `<<<卡組>>>` 到最後一個 `<<<完>>>` 之間；不分段的整份留、切掉最後一個 `<<<完>>>` 之後。
 * 外層程式碼框只拿掉頭尾一行；頭尾的空行去掉，結尾一個換行。三段的找不到 `<<<卡組>>>` 回 ok: false（停下給人看）。
 */
export function cutDeck(reply: string, threeSections: boolean): Cut {
  let lines = reply.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const end = lines.map(line => line.trim()).lastIndexOf(END);
  if (threeSections) {
    const start = lines.findIndex(line => line.trim() === DECK);
    if (start < 0) return { ok: false, why: `找不到 ${DECK}` };
    lines = lines.slice(start + 1, end > start ? end : lines.length);
  } else if (end >= 0) lines = lines.slice(0, end);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  if (lines.length && OPEN_FENCE.test(lines[0])) lines.shift();
  if (lines.length && CLOSE_FENCE.test(lines.at(-1)!)) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  return { ok: true, deck: lines.length ? lines.join('\n') + '\n' : '' };
}

/** 有效原稿（§4-2，開跑前定義）：有 `<<<完>>>`、卡組段不是空的。不是卡組的步驟只要回覆不是空的。 */
export function validity(reply: string, deck: boolean, threeSections: boolean): { valid: boolean; why: string | null } {
  if (!deck) return reply.trim() ? { valid: true, why: null } : { valid: false, why: '回覆是空的' };
  if (!reply.replace(/\r\n?/g, '\n').split('\n').some(line => line.trim() === END)) return { valid: false, why: `沒有 ${END}` };
  const cut = cutDeck(reply, threeSections);
  if (!cut.ok) return { valid: false, why: cut.why };
  return cut.deck.trim() ? { valid: true, why: null } : { valid: false, why: '卡組段是空的' };
}
