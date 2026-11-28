// 視窗測試共用（tests/ai-cards-modal.test.ts、tests/deepen-modal-direct.test.ts）：共用的 obsidian 替身的 FakeEl 補上視窗用到的 DOM 方法。
// 替身不是 Obsidian 實機：import 這個檔就補上（每個測試檔是自己的 Node 程序，補的只活在那個檔）。畫面的樣子在 Windows 實機看。
import { FakeEl } from './obsidian.ts';

export interface El extends FakeEl {
  cls: string; type?: string; placeholder?: string; value: string; checked?: boolean; files?: File[];
  listeners?: Map<string, ((event: unknown) => void)[]>;
  fire(type: string, event?: unknown): void;
}
const proto = FakeEl.prototype as unknown as Record<string, unknown>;
proto.createEl = function (this: El, tag: string, options?: { text?: string; cls?: string; type?: string; placeholder?: string; attr?: Record<string, string> }): El {
  const el = new FakeEl(tag, options) as El;
  el.cls = options?.cls ?? '';
  el.type = options?.type;
  el.placeholder = options?.placeholder ?? options?.attr?.placeholder;
  el.value = '';
  this.children.push(el);
  return el;
};
proto.addEventListener = function (this: El, type: string, callback: (event: unknown) => void) { (this.listeners ??= new Map()).set(type, [...this.listeners.get(type) ?? [], callback]); };
proto.fire = function (this: El, type: string, event: unknown = {}) { for (const callback of this.listeners?.get(type) ?? []) callback(event); };
proto.click = function (this: El) { if (!this.disabled) this.fire('click'); };
proto.hide = function (this: El) { this.hidden = true; };
proto.show = function (this: El) { this.hidden = false; };
proto.toggleClass = function () {};
proto.querySelector = function (this: El, selector: string): El | null {
  const want = selector.replace(/^\./, '');
  for (const child of this.children as El[]) {
    if (child.cls.split(' ').includes(want)) return child;
    const found = (child as unknown as { querySelector(selector: string): El | null }).querySelector(selector);
    if (found) return found;
  }
  return null;
};

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export const all = (el: FakeEl): El[] => [el as El, ...el.children.flatMap(all)];
export const texts = (el: FakeEl): string[] => all(el).map(each => each.text).filter(Boolean);
export const button = (el: FakeEl, label: string): El | undefined => all(el).find(each => each.tag === 'button' && !each.hidden && each.text === label);
export const textarea = (el: FakeEl): El | undefined => all(el).find(each => each.tag === 'textarea');
