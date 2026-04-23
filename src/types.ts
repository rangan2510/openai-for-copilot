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
  id: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  name: string;
  supportsTools: boolean;
  supportsVision: boolean;
}
