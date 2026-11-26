// 唯一的公開入口：這裡 export 的就是全部的公開介面，其他檔是內部（docs/tasks/ai-client.md〈3〉第 2 點）。
export { createAiClient } from './client.ts';
export type { AiClient, AiClientOptions, CheckRequest, CheckResult, Clock } from './client.ts';
export { AiError, describeAiError, isAiError } from './errors.ts';
export type { AiErrorKind } from './errors.ts';
export type { CatalogOverrides, CatalogProblem } from './catalog.ts';
export type { FetchInit, FetchLike } from './transport.ts';
export { REASONING_LEVELS } from './types.ts';
export type {
  AttemptTrace, AuthSpec, Catalog, ContentPart, Cost, CustomEndpoint, EndpointRef, GenerateRequest, GenerateResult, InputKind,
  Message, ModelInfo, ModelSpec, PriceSpec, ProgressEvent, ProviderOptions, ProviderSpec, ReasoningLevel, ReasoningSpec, StopReason,
  Trace, Usage,
} from './types.ts';
