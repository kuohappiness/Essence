// 製卡規則的比較測試工具（任務說明 apps/Cards/docs/tasks/rule-test-tool.md）。
// 用法：npm run rule-test -- <指令> …；指令與步驟見同一個資料夾的 README.md。
import { blind } from './blind.ts';
import { check } from './check.ts';
import { disputes } from './disputes.ts';
import { extend } from './extend.ts';
import { freeze } from './freeze.ts';
import { generate } from './generate.ts';
import { judge } from './judge.ts';
import { paste } from './paste.ts';
import { probe } from './probe.ts';
import { status } from './status.ts';
import { unblind } from './unblind.ts';

const COMMANDS: Record<string, () => Promise<void>> = {
  probe,
  freeze,
  generate,
  paste,
  check,
  blind,
  judge,
  disputes,
  unblind,
  extend,
  status,
};

const name = process.argv[2];
const command = name === undefined ? undefined : COMMANDS[name];
if (!command) {
  console.error(`用法：npm run rule-test -- <${Object.keys(COMMANDS).join('|')}> …`);
  process.exitCode = 1;
} else {
  try {
    await command();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
