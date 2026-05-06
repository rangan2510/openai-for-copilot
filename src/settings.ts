import * as vscode from "vscode";

export interface OpenAISettings {
  baseUrl: string | undefined;
  organization: string | undefined;
  preferredModel: string | undefined;
  reasoningEffort: ReasoningEffort;
}

export type ApiReasoningEffort =
  | "high"
  | "low"
  | "medium"
  | "minimal"
  | "none"
  | "xhigh";
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
 * Get OpenAI settings from VS Code configuration.
 */
export function getOpenAISettings(): OpenAISettings {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");

  const baseUrl = config.get<string | null>("baseUrl") ?? undefined;
  const organization = config.get<string | null>("organization") ?? undefined;
  const preferredModel =
    config.get<string | null>("preferredModel") ?? undefined;

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
  };
}
