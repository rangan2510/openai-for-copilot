import * as vscode from "vscode";

export interface OpenAISettings {
  baseUrl: string | undefined;
  /**
   * Extra token headroom subtracted from a model's advertised input window so
   * that input + output + this margin stays clear of the hard context ceiling.
   * Guards against char/4 token-count undercounting and reasoning-token spend
   * that would otherwise trigger context-overflow errors, especially on the
   * 400K/1M-context GPT-5.x and GPT-4.1 models.
   */
  contextSafetyMargin: number;
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

  // Context safety margin (tokens reserved on top of the output budget).
  // Clamped to a sane range so a bad value can't make maxInputTokens negative.
  const rawSafetyMargin = config.get<number>("contextSafetyMargin");
  const contextSafetyMargin =
    typeof rawSafetyMargin === "number" && Number.isFinite(rawSafetyMargin)
      ? Math.min(200_000, Math.max(0, Math.floor(rawSafetyMargin)))
      : 32_000;

  return {
    baseUrl,
    contextSafetyMargin,
    organization,
    preferredModel,
    reasoningEffort,
    showReasoning,
    storeConversations,
  };
}
