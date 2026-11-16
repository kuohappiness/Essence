import { parseDeck } from '../deck/index.ts';
import { planExisting } from './existing.ts';
import type { Endpoint } from './existing-sources.ts';
import { findItem } from './intro.ts';
import type { BoxItem, IntroBox, ItemRef } from './intro.ts';
import { takeOut, WHY } from './move.ts';
import type { Left } from './move.ts';

// 加進已有的學習目標的最後一步（tasks/ai-cards-add.md §4 第 4 步）：在來源最新的文字裡照身分與原文找那一項、用來源最新的屬性
// 對目的地再確認一次〈目的地已經有這一項〉，成立才從框裡拿掉；同一篇的項目在這一次加進自己的目標。只算文字，不寫檔。

export const CLEAR_WHY = {
  edited: '這一項剛改過，題目已經加進去了，框裡的請自己看要不要刪',
  destChanged: '原本的卡組剛改過，請再按一次',
  sourceChanged: '這篇筆記剛改過，題目已經加進原本的卡組；這一項先留在框裡，請再按一次',
} as const;

/** 一項：dest 是第 3 步確認過的目的地那一版；null 是目的地就是這一篇。 */
export interface ClearItem { ref: ItemRef; id: string; dest: { path: string; text: string } | null }
export interface ClearInput {
  path: string;
  /** 來源最新的全文。 */
  text: string;
  /**
   * 第 1 步讀到的來源全文：最新的和它不同（換行字元除外）就一項都不拿（L2 R1）。路徑上的檔可能已經換成別的一篇，
   * 只看那一項的原文分不出來；家長在這段時間改了別處，也等重按時照新的文字再算。
   */
  read?: string;
  items: readonly ClearItem[];
  version: string | null;
  resolve?: (link: string, from: string) => string | null;
  /** 教材端點（§3-3 第 8 步），照目的地那一篇給。 */
  endpoint?: (dest: string) => Endpoint;
}
/** text：拿掉（與同篇加入）之後的全文，沒有要改是 null。done：拿掉了的；left：留在框裡的與原因。 */
export interface ClearPlan { text: string | null; done: ItemRef[]; left: Left[] }

export function clearExisting(input: ClearInput): ClearPlan {
  const { text, path } = input;
  const props = parseDeck(text).props;
  const left: Left[] = [];
  const cross: { each: ClearItem; item: BoxItem; box: IntroBox }[] = [];
  let own: { each: ClearItem; item: BoxItem; box: IntroBox }[] = [];
  const moved = input.read !== undefined && input.read.replace(/\r\n?/g, '\n') !== text.replace(/\r\n?/g, '\n');
  for (const each of input.items) {
    const found = findItem(text, each.ref);
    if (found.kind !== 'found' || found.item.kind !== 'existing' || found.item.id !== each.id) {
      // 跨篇的那一項目的地已經加過：改了就是家長動過，留著讓家長自己看（只拿掉自己搬的）。
      left.push({ ref: each.ref, why: found.kind === 'duplicate' ? WHY.duplicate : each.dest ? CLEAR_WHY.edited : WHY.changed });
      continue;
    }
    if (moved) { left.push({ ref: each.ref, why: each.dest ? CLEAR_WHY.sourceChanged : WHY.changed }); continue; }
    if (!each.dest) { own.push({ each, item: found.item, box: found.box }); continue; }
    const plan = planExisting({ original: found.item.original, id: each.id, source: { path, props }, dest: each.dest, version: input.version, resolve: input.resolve, endpoint: input.endpoint?.(each.dest.path) });
    if (plan.kind === 'plan' && plan.text === null) cross.push({ each, item: found.item, box: found.box });
    else left.push({ ref: each.ref, why: CLEAR_WHY.destChanged });
  }
  // 同一篇的：先拿掉這一批的全部項目，再依序加進自己的目標；有一項加不進去就把它放回框裡重算（拿掉的區間都對同一份原文算）。
  for (;;) {
    let next = takeOut(text, [...cross, ...own]);
    const failed = own.map(({ each, item }) => {
      const plan = planExisting({ original: item.original, id: each.id, source: { path, props }, dest: { path, text: next }, version: input.version });
      if (plan.kind === 'leave') return { ref: each.ref, why: plan.why };
      if (plan.text !== null) next = plan.text;
      return null;
    }).find(each => each !== null);
    if (failed) {
      left.push(failed);
      own = own.filter(each => each.each.ref !== failed.ref);
      continue;
    }
    const done = input.items.filter(each => cross.some(c => c.each === each) || own.some(o => o.each === each)).map(each => each.ref);
    const order = (list: Left[]): Left[] => list.sort((a, b) => input.items.findIndex(each => each.ref === a.ref) - input.items.findIndex(each => each.ref === b.ref));
    return { text: done.length && next !== text ? next : null, done: next !== text ? done : [], left: order(left) };
  }
}
