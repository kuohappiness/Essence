// 冒煙測試：用真的金鑰送一次小請求（docs/tasks/ai-client.md〈10〉）。只在使用者自己的電腦跑，不進 CI。
// 用法：
//   AI_KEY_OPENAI=… npm run smoke -- --provider openai --model gpt-5.6-terra [--reasoning low] [--max-output 2000] [--no-pdf]
// 金鑰讀環境變數 AI_KEY_<廠商 id 大寫>（例如 AI_KEY_GOOGLE、AI_KEY_ANTHROPIC、AI_KEY_OPENROUTER），不從命令列讀（才不會留在命令紀錄）。
// 送一段自編的短文與一頁自編的 PDF（程式當場產生，不讀任何教材），印出結果、用量、費用與證據；不印金鑰。
import { parseArgs } from 'node:util';
import { createAiClient, describeAiError, isAiError, REASONING_LEVELS, type ContentPart, type ReasoningLevel } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    provider: { type: 'string' },
    model: { type: 'string' },
    reasoning: { type: 'string' },
    'max-output': { type: 'string', default: '2000' },
    'no-pdf': { type: 'boolean', default: false },
  },
});

if (!values.provider || !values.model) {
  console.error('用法：npm run smoke -- --provider <廠商> --model <模型> [--reasoning low] [--max-output 2000] [--no-pdf]');
  process.exit(2);
}
const reasoning = values.reasoning as ReasoningLevel | undefined;
if (reasoning !== undefined && !REASONING_LEVELS.includes(reasoning)) {
  console.error(`推理等級只能是 ${REASONING_LEVELS.join('、')}`);
  process.exit(2);
}
const envName = `AI_KEY_${values.provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
const apiKey = process.env[envName];

/** 一頁、只有一行英文的 PDF（標準字型 Helvetica，不需要內嵌字型）。 */
function tinyPdf(line: string): Uint8Array {
  const content = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const client = createAiClient();
const endpoint = { provider: values.provider };
console.log(`廠商 ${values.provider}，模型 ${values.model}，金鑰 ${apiKey ? `讀自 ${envName}` : `沒有（${envName} 沒設）`}`);

const check = await client.check({ endpoint, apiKey });
console.log(check.ok ? `測試連線：成功${check.models ? `，列出 ${check.models.length} 個模型` : ''}` : `測試連線：失敗（${check.error.kind}）${check.error.message}`);

const content: ContentPart[] = [];
if (!values['no-pdf']) content.push({ type: 'file', mediaType: 'application/pdf', name: 'smoke.pdf', data: tinyPdf('Photosynthesis turns light energy into chemical energy.'), pages: 1 });
content.push({ type: 'text', text: values['no-pdf'] ? '用一句繁體中文說明光合作用。' : '用一句繁體中文說明這份 PDF 的內容。' });

const started = Date.now();
try {
  const result = await client.generate({
    endpoint, apiKey, model: values.model, reasoning,
    maxOutputTokens: Number(values['max-output']),
    input: [{ role: 'user', content }],
    // 經過的毫秒數：waiting 那一行就是拿到回應標頭花的時間（驗「連不上時照樣重送」的推斷，L2 第二輪 延續 R7）。
    onProgress: e => { if (e.type !== 'text') console.log(`  進度（${String(Date.now() - started)} ms）：${JSON.stringify(e)}`); },
  });
  console.log(`\n回覆（${result.stopReason}，${((Date.now() - started) / 1000).toFixed(1)} 秒）：\n${result.text.slice(0, 500)}\n`);
  console.log('用量：', result.usage);
  console.log('費用：', result.cost);
  console.log('證據：', result.trace);
} catch (error) {
  if (!isAiError(error)) throw error;
  console.log(`\n失敗：${error.kind}（${describeAiError(error)}）`);
  console.log(JSON.stringify(error, null, 2));
  process.exitCode = 1;
}
