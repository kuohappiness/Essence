import { retargetSnapshot } from '../core/ai/index.ts';
import { isDeckPath } from '../core/deck/index.ts';

// 卡組改名時快照的連結跟著走（AI 製卡第 2 批 L2 R7，使用者 2026-11-17 選 D）：Obsidian 的「自動更新內部連結」沒開、家長在詢問框選不更新，
// 或別的外掛改名沒更新連結時，加深讀不到以前的快照、當成第一次。外掛收到 rename 時自己把快照 `對象` 的連結改到新位置；
// 外掛沒開著時的改名、寫入被擋下（備份、手機、載入中）時不補，照第一次算（任務說明 §2-3）。

export interface SnapshotLinkIo {
  /** Obsidian 的「自動更新內部連結」開著：它會自己改（連本文的連結一起），外掛不再寫同一份，免得兩邊同時寫掉對方的改動。 */
  autoUpdate(): boolean;
  /** 寫入的門檻（state 的 writeBlock）擋著。 */
  blocked(): boolean;
  /** 快照資料夾裡的快照（不含 `原文/`）。 */
  snapshots(): Promise<{ path: string; text: string }[]>;
  /** 這個檔名（小寫、沒有 `.md`）現在的檔案路徑。 */
  named(name: string): string[];
  /** 對最新的全文改寫（vault.process）；回傳的字和原文相同就不寫。 */
  process(path: string, change: (text: string) => string): Promise<void>;
}

/** 改名或搬移（old → next，都是 .md 的完整路徑）：舊位置是卡組才處理。回傳改了幾份快照。 */
export async function retargetSnapshots(io: SnapshotLinkIo, old: string, next: string): Promise<number> {
  if (!isDeckPath(old) || io.autoUpdate() || io.blocked()) return 0;
  const left = (name: string): number => io.named(name).filter(isDeckPath).length;
  let count = 0;
  for (const each of await io.snapshots()) {
    if (retargetSnapshot(each.text, old, next, left) === null) continue;
    // 寫入的當下對最新的全文再做一次：讀了之後被改過、或已經被改好的，照最新的算。
    await io.process(each.path, text => retargetSnapshot(text, old, next, left) ?? text);
    count++;
  }
  return count;
}
