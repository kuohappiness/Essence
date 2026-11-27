// AI 連線（apps/Cards/docs/tasks/ai-direct.md §1、§2）：Cards 連 AI 服務的地方都從這裡拿。套件只經過轉接檔 client.ts。
export { createAiClient, describeAiError, isAiError } from './client.ts';
export { cardsClient, keyOf, modelChoices, modelOf, providerChoices, providerName, readConnection, REASONING_CHOICES, sharedWith, testConnection, withSecret } from './connection.ts';
export type { Connection, KeyLookup } from './connection.ts';
export { directRequest, evidenceOf, failureLog, materialProblem, materialType, providerProblem, sendDirect, sendingLine, sentFiles, usageLine } from './direct.ts';
export type { DirectFailure, DirectLog, Material } from './direct.ts';
export type { AiClient, ProgressEvent, ProviderSpec } from './client.ts';
