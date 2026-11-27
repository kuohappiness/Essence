// AI 連線（apps/Cards/docs/tasks/ai-direct.md §1、§2）：Cards 連 AI 服務的地方都從這裡拿。套件只經過轉接檔 client.ts。
export { createAiClient, describeAiError, isAiError } from './client.ts';
