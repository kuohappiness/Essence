// 套件的 knip（npm run knip）：和共用工具的 tools/run-knip.mjs、Cards 的 tools/knip.mjs 一樣關掉 raw transfer。
// knip 的解析器一次預留約 6 GB 記憶體，電腦可用的記憶體不夠時報 `RangeError: Array buffer allocation failed`（L2 R18，Windows）；檢查項目不變。
// 放在套件自己的資料夾，複製到別的 repo 也能用。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const knip = fileURLToPath(new URL('../node_modules/knip/bin/knip.js', import.meta.url));
const result = spawnSync(process.execPath, [knip, ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, KNIP_DISABLE_RAW_TRANSFER: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
