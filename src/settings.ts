import * as vscode from "vscode";

export interface OpenAISettings {
  baseUrl: string | undefined;
  organization: string | undefined;
  preferredModel: string | undefined;
  reasoningEffort: ReasoningEffort;
  showReasoning: boolean;
  storeConversations: boolean;
}

/**
 * API-recognized reasoning effort values. Not every model supports every level;
 * see `getModelProfile` in `profiles.ts`.
 */
export type ApiReasoningEffort =
  | "high"
  | "low"
  | "medium"
  | "minimal"
  | "none"
  | "xhigh";

/**
 * Reasoning effort options exposed in settings. `model-default` means we omit
 * the field entirely so the model uses its own default.
 */
export type ReasoningEffort = ApiReasoningEffort | "model-default";

export const VALID_REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = [
  "model-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * Read OpenAI settings from VS Code configuration.
 */
export function getOpenAISettings(): OpenAISettings {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");

  const baseUrl = config.get<string | null>("baseUrl") ?? undefined;
  const organization = config.get<string | null>("organization") ?? undefined;
  const preferredModel =
    config.get<string | null>("preferredModel") ?? undefined;
  const showReasoning = config.get<boolean>("showReasoning") ?? true;
  const storeConversations = config.get<boolean>("storeConversations") ?? true;

  const rawEffort = config.get<string>("reasoningEffort");
  const reasoningEffort: ReasoningEffort =
    rawEffort &&
    VALID_REASONING_EFFORT_VALUES.includes(rawEffort as ReasoningEffort)
      ? (rawEffort as ReasoningEffort)
      : "model-default";

  return {
    baseUrl,
    organization,
    preferredModel,
    reasoningEffort,
    showReasoning,
    storeConversations,
  };
}
