// 串流事件（Server-Sent Events）的解碼：照 WHATWG 的規則切行與事件。位元組先經 TextDecoder 的串流模式，
// 一個中文字被切在兩段之間也會接回來（docs/tasks/ai-client.md〈7〉第 3 點）。

export interface SseEvent {
  event: string;
  data: string;
}

export class SseDecoder {
  #decoder = new TextDecoder('utf-8');
  #buffer = '';
  #event = '';
  #data: string[] = [];
  #first = true;
  /** 上一段最後是 \r：下一段開頭的 \n 屬於同一個換行。 */
  #pendingCr = false;

  /** 餵一段位元組，回傳這段湊齊的事件。 */
  push(chunk: Uint8Array): SseEvent[] {
    return this.#feed(this.#decoder.decode(chunk, { stream: true }));
  }

  /** 串流結束：把最後沒有空行結尾的事件也交出（寬鬆處理，有些服務最後不送空行）。 */
  end(): SseEvent[] {
    const events = this.#feed(this.#decoder.decode());
    if (this.#buffer) {
      this.#line(this.#buffer, events);
      this.#buffer = '';
    }
    if (this.#data.length) this.#dispatch(events);
    return events;
  }

  #feed(text: string): SseEvent[] {
    const events: SseEvent[] = [];
    let input = text;
    if (this.#first && input) {
      if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
      this.#first = false;
    }
    if (this.#pendingCr && input.startsWith('\n')) input = input.slice(1);
    this.#pendingCr = false;
    this.#buffer += input;
    let start = 0;
    for (let i = 0; i < this.#buffer.length; i++) {
      const ch = this.#buffer.charCodeAt(i);
      if (ch !== 10 && ch !== 13) continue;
      this.#line(this.#buffer.slice(start, i), events);
      if (ch === 13) {
        if (i + 1 < this.#buffer.length) {
          if (this.#buffer.charCodeAt(i + 1) === 10) i++;
        } else {
          this.#pendingCr = true;
        }
      }
      start = i + 1;
    }
    this.#buffer = this.#buffer.slice(start);
    return events;
  }

  #line(line: string, events: SseEvent[]): void {
    if (line === '') {
      this.#dispatch(events);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.#event = value;
    else if (field === 'data') this.#data.push(value);
  }

  #dispatch(events: SseEvent[]): void {
    if (this.#data.length) events.push({ event: this.#event || 'message', data: this.#data.join('\n') });
    this.#event = '';
    this.#data = [];
  }
}
