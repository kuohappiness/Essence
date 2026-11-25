// 題型接點的第一個（D-181）：一種題型的名稱與題目怎麼認、哪些算寫錯。其他三個在 core/study/compose.ts、review/flow.ts、ui/screens.tsx。
// 認法照卡型拆在 kinds/，一種卡型一個檔（題型模組任務說明 §1-3）；這裡轉出，對外的匯出和拆檔前一樣。

export { typedAnswer } from './typed-answer.ts';
export { blanksIn, pickKey, unbold } from './kinds/shared.ts';
export { pickWord, readPick } from './kinds/group.ts';
export { choiceProblems, choiceStem, readChoice } from './kinds/polyphone.ts';
export { readOrder, readSentence } from './kinds/order.ts';
export { mentions, pairWordOf, readTyping } from './kinds/typing.ts';
export { readCouplet } from './kinds/couplet.ts';
