// 方言的登記表。加一種方言：寫一個實作 Dialect 的檔，加進下面的表。
import { anthropicMessages } from './anthropic-messages.ts';
import { geminiGenerateContent } from './gemini-generate-content.ts';
import { openaiChat } from './openai-chat.ts';
import { openaiResponses } from './openai-responses.ts';
import type { Dialect } from './types.ts';

export const DIALECTS: ReadonlyMap<string, Dialect> = new Map(
  [openaiResponses, openaiChat, geminiGenerateContent, anthropicMessages].map(d => [d.id, d]),
);
