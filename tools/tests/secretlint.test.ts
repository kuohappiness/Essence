import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSecretLint } from 'secretlint';

// 金鑰掃描的規則（.secretlintrc.json）認得 AI 連線套件支援的每一家的金鑰（packages/ai-client，D-232）。
// 假金鑰在執行時才拼出來，前綴拆開寫，本檔才不會被掃到；字元是固定的，不是任何服務發的。
const fill = (length: number, chars: string): string => Array.from({ length }, (_, i) => chars[(i * 7 + 3) % chars.length]).join('');
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEYS: Record<string, string> = {
  openai: 'sk-' + 'proj-' + fill(74, ALNUM + '_-') + 'T3Blbk' + 'FJ' + fill(74, ALNUM + '_-'),
  anthropic: 'sk-' + 'ant-api03-' + fill(93, ALNUM + '_-') + 'AA',
  google: 'AI' + 'za' + fill(35, ALNUM + '_-'),
  openrouter: 'sk-' + 'or-v1-' + fill(64, '0123456789abcdef'),
};

async function flagged(text: string): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), 'essence-secretlint-'));
  try {
    await writeFile(join(dir, 'probe.md'), text);
    const result = await runSecretLint({
      cliOptions: { cwd: dir, filePathOrGlobList: ['probe.md'], noGlob: true },
      engineOptions: { cwd: dir, configFilePath: fileURLToPath(new URL('../../.secretlintrc.json', import.meta.url)), formatter: 'json', color: false, maskSecrets: true },
    });
    return result.exitStatus !== 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (const [provider, key] of Object.entries(KEYS)) {
  void test(`金鑰掃描擋下 ${provider} 的金鑰：程式、JSON 與文件裡的寫法`, async () => {
    const texts = { 程式: `const key = '${key}';\n`, JSON: `{"apiKey": "${key}"}\n`, 文件: `金鑰：${key}\n` };
    for (const [where, text] of Object.entries(texts)) assert.equal(await flagged(text), true, where);
  });
}

void test('金鑰掃描不擋只寫前綴的說明', async () => {
  assert.equal(await flagged('Google 的金鑰以 `AI' + 'za` 開頭，OpenRouter 的以 `sk-' + 'or-v1-` 開頭。\n'), false);
});
