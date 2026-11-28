// 行內連結 [文字](目標) 的「目標」怎麼切：文件檢查、狀態行、roadmap 工具、決策紀錄與 skill 鏡像檢查共用這一個寫法。
// 只寫在這裡：各工具各寫一份時，檔名有括號的連結（guide(v1).md）在其中幾支切在第一個「)」，被當成壞連結。

/** 沒有 `<>` 的目標：沒有空白，括號要成對（一層，guide(v1).md），和 CommonMark 一樣不收不成對的括號。 */
const PLAIN = String.raw`(?:[^()\s]|\([^()\s]*\))+`;
const WHOLE_PLAIN = new RegExp(String.raw`^${PLAIN}$`);

/** 連結的目標：`<有空白的路徑>`，或沒有 `<>` 的路徑。用在正規表示式的群組裡：`\((${LINK_TARGET})\)`。 */
export const LINK_TARGET = String.raw`<[^>]*>|${PLAIN}`;

/** 工具寫出的連結目標：切得回原樣的照寫，有空白或不成對的括號時用 `<>` 包。 */
export const asTarget = (path: string) => WHOLE_PLAIN.test(path) ? path : `<${path}>`;
