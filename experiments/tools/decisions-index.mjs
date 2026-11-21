// 搬到 tools/decisions-index.ts（D-214 第 5、8、9 點）；這裡轉呼叫，舊文件與 AGENTS.md 寫的指令照樣能用。
// 用法同 node tools/decisions-index.ts [D-xxx …] [--deep]。
import { main } from '../../tools/decisions-index.ts';

main(process.argv.slice(2));
