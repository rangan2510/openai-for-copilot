/**
 * Authentication configuration for OpenAI.
 * API key is the primary method. Stored in VS Code SecretStorage.
 */
export interface AuthConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * Summary of an OpenAI model available for chat.
 */
export interface OpenAIModelSummary {
  /**
   * The real OpenAI model id to send to the API. Differs from `id` only for
   * pro-mode entries, whose `id` carries a synthetic `:pro` suffix.
   */
  baseModelId: string;
  id: string;
  /** Whether this entry requests `reasoning.mode: "pro"`. */
  isProMode: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  name: string;
  supportsTools: boolean;
  supportsVision: boolean;
}
