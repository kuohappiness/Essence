// 圍欄程式碼區塊（``` 或 ~~~）佔的行：決策查詢（decisions.ts）與 section.ts 共用（L2 R10）。沒有 npm 相依，沒裝過 tools/ 的相依也能跑。
// 照 CommonMark：引用框裡的也算（先拿掉每行開頭的「>」）；反引號圍欄的資訊欄不能有反引號；收尾要同一種字元、不短於開頭、後面只能有空白；
// 沒收尾的算到引用框結束或檔尾。清單裡縮排四格以上的圍欄也算：不追蹤清單的縮排，所以不在清單裡、縮排四格以上的「```」
// （CommonMark 是縮排程式碼區塊）也當成圍欄；縮排程式碼區塊本身不認。收尾最多比開頭多縮排三格（代替「比所在的區塊多三格」）。
// 已知的限制：清單裡沒收尾的圍欄，清單結束後仍算到檔尾（CommonMark 在清單結束時關掉）。

interface Open { char: string; length: number; depth: number; indent: number }

/** 開頭空白的寬度：tab 補到下一個 4 的倍數（CommonMark 的 tab stop）。 */
const width = (space: string) => [...space].reduce((n, c) => (c === '\t' ? n + 4 - (n % 4) : n + 1), 0);

/** 拿掉開頭最多 max 層引用框的「>」，回傳剩下的字與拿掉幾層。 */
function unquote(line: string, max: number): { rest: string; depth: number } {
  let rest = line;
  let depth = 0;
  while (depth < max) {
    const marker = /^ {0,3}> ?/.exec(rest);
    if (!marker) break;
    rest = rest.slice(marker[0].length);
    depth++;
  }
  return { rest, depth };
}

/** 每一行是不是在圍欄程式碼區塊裡（開頭與收尾那一行也算）。 */
export function fencedLines(lines: readonly string[]): boolean[] {
  let open: Open | undefined;
  return lines.map(line => {
    if (open) {
      const { rest, depth } = unquote(line, open.depth);
      // 引用框在這一行結束：圍欄跟著結束，這一行照一般的行看。
      if (depth < open.depth) open = undefined;
      else {
        // 收尾最多比開頭多縮排三格（CommonMark 是比所在的區塊多三格；不追蹤清單，用開頭的縮排代替，L2 第二輪 N10）。
        const close = /^([ \t]*)(`{3,}|~{3,})\s*$/.exec(rest);
        if (close && width(close[1]) <= open.indent + 3 && close[2][0] === open.char && close[2].length >= open.length) open = undefined;
        return true;
      }
    }
    const { rest, depth } = unquote(line, Infinity);
    const fence = /^([ \t]*)(`{3,}|~{3,})(.*)$/.exec(rest);
    if (!fence || (fence[2][0] === '`' && fence[3].includes('`'))) return false;
    open = { char: fence[2][0], length: fence[2].length, depth, indent: width(fence[1]) };
    return true;
  });
}
