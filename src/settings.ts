import * as vscode from "vscode";

export interface OpenAISettings {
  baseUrl: string | undefined;
  organization: string | undefined;
  preferredModel: string | undefined;
  reasoningEffort: ReasoningEffort;
}

export type ReasoningEffort = "high" | "low" | "medium";

/**
 * Get OpenAI settings from VS Code configuration.
 */
export function getOpenAISettings(): OpenAISettings {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");

  const baseUrl = config.get<string | null>("baseUrl") ?? undefined;
  const organization = config.get<string | null>("organization") ?? undefined;
  const preferredModel = config.get<string | null>("preferredModel") ?? undefined;

  const validEffortValues: ReasoningEffort[] = ["high", "low", "medium"];
  const rawEffort = config.get<string>("reasoningEffort");
  const reasoningEffort: ReasoningEffort =
    rawEffort && validEffortValues.includes(rawEffort as ReasoningEffort)
      ? (rawEffort as ReasoningEffort)
      : "medium";

  return {
    baseUrl,
    organization,
    preferredModel,
    reasoningEffort,
  };
}
