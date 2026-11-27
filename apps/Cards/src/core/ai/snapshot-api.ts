import type { DirectEvidence } from './job.ts';

// 直接製作寫進快照的欄（tasks/ai-direct.md §7、syntax.md §6）：製卡（publish.ts）與加深（deepen-job.ts）共用同一份。

/** 寫進屬性區的外來字串（檔名、服務回傳的模型與編號，F11）：一律單行，換行與控制字元換成一個空白，最多 200 字。 */
function oneLine(text: string): string {
  return Array.from(text.replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')).slice(0, 200).join('');
}
/** 「未指定」「high」：推理等級照套件的寫法（F10）。 */
const LEVEL_UNSET = '未指定';

/**
 * 直接製作的快照欄（§7，欄位順序照格式查核 F17）：程式知道的一律寫；服務給的拿不到就不寫，不寫 0 也不寫「不知道」；`模型` 例外寫「未回報」。
 * 寫在 `回覆原文` 之後到 `程式改動` 之前；`教材說明` 由呼叫端照原本的位置放。製卡與加深共用（tasks/ai-direct.md §9）。
 * copiedAt 是第一次組好提示的那一刻（`送出時間`），replySha 是輸入框交出的那一段（`回覆原文`）。
 */
export function apiFields(copiedAt: string, replySha: string, api: DirectEvidence): { early: Record<string, unknown>; files: Record<string, unknown>; late: Record<string, unknown> } {
  const early: Record<string, unknown> = {};
  if (api.sha256 !== replySha) early['收到的回覆'] = api.sha256;
  early['送出時間'] = copiedAt;
  early['收到時間'] = api.receivedAt;
  const files: Record<string, unknown> = {};
  if (api.files.length) files['教材檔'] = api.files.map(file => `${file.sha256} ${file.pages === null ? '圖' : `${String(file.pages)}頁`} ${oneLine(file.name)}`);
  const late: Record<string, unknown> = {
    接法: 'API',
    服務: api.service,
    要求的模型: oneLine(api.requestedModel),
    模型: api.model === null ? '未回報' : oneLine(api.model),
    推理等級: api.reasoning ?? LEVEL_UNSET,
  };
  if (api.reasoningSent !== null) late['推理參數'] = typeof api.reasoningSent === 'string' ? oneLine(api.reasoningSent) : api.reasoningSent;
  const usage: [string, number | null][] = [['輸入用量', api.usage.input], ['快取讀取用量', api.usage.cacheRead], ['快取寫入用量', api.usage.cacheWrite], ['輸出用量', api.usage.output], ['推理用量', api.usage.reasoning]];
  for (const [name, value] of usage) if (value !== null) late[name] = value;
  if (api.cost) {
    // 服務回報的金額可能帶浮點雜訊（0.30000000000000004，L2 第一輪的文字小項）：取 12 位有效數字，雜訊去掉、金額不變。
    late['費用'] = Number(api.cost.amount.toPrecision(12));
    late['費用來源'] = api.cost.estimated ? '照牌價估計' : '服務回報';
    if (api.cost.estimated && api.cost.asOf) late['牌價日期'] = oneLine(api.cost.asOf);
  }
  if (api.requestId !== null) late['請求編號'] = oneLine(api.requestId);
  if (api.responseId !== null) late['回應編號'] = oneLine(api.responseId);
  return { early, files, late };
}
