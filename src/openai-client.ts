import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

import { logger } from "./logger";
import { getModelProfile, getModelTokenLimits } from "./profiles";
import type { AuthConfig, OpenAIModelSummary } from "./types";

/**
 * Wrapper around the OpenAI SDK client.
 * Handles client lifecycle, model listing, and streaming chat completions.
 */
export class OpenAIAPIClient {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string, organization?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      ...(organization ? { organization } : {}),
      maxRetries: 2,
    });
  }

  /**
   * Update the client configuration (e.g., after API key change).
   */
  setAuthConfig(config: AuthConfig): void {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      ...(config.organization ? { organization: config.organization } : {}),
      maxRetries: 2,
    });
  }

  /**
   * Fetch the list of available models from the OpenAI API.
   * Filters to chat-capable models only.
   */
  async fetchModels(abortSignal?: AbortSignal): Promise<OpenAIModelSummary[]> {
    const models: OpenAIModelSummary[] = [];

    try {
      const response = await this.client.models.list({ signal: abortSignal });

      for await (const model of response) {
        // Filter to known chat-capable model families
        if (isChatModel(model.id)) {
          models.push(buildModelSummary(model.id));
        }
      }
    } catch (error) {
      logger.error("[OpenAI Client] Failed to fetch models", error);
      throw error;
    }

    logger.info(`[OpenAI Client] Found ${models.length} chat-capable models`);
    return models;
  }

  /**
   * Start a streaming chat completion.
   * Returns an async iterable of ChatCompletionChunk.
   */
  async startChatStream(
    params: ChatCompletionCreateParamsStreaming,
    abortSignal?: AbortSignal,
  ): Promise<AsyncIterable<ChatCompletionChunk>> {
    const stream = await this.client.chat.completions.create(
      { ...params, stream: true },
      { signal: abortSignal },
    );
    return stream;
  }
}

/**
 * Check if a model ID is a known chat-capable model.
 * Excludes non-chat variants (realtime, audio, TTS, transcription, codex,
 * deep-research, search-api) that share prefixes with chat models.
 */
function isChatModel(modelId: string): boolean {
  const excludedPatterns = [
    "-realtime",
    "-audio",
    "-tts",
    "-transcribe",
    "-codex",
    "-deep-research",
    "-search-api",
    "-image",
    "-pro",
  ];
  if (excludedPatterns.some((pattern) => modelId.includes(pattern))) {
    return false;
  }

  const chatPrefixes = [
    "gpt-4o",
    "gpt-4.1",
    "gpt-4-turbo",
    "gpt-5",
    "o1",
    "o3",
    "o4",
    "chatgpt-4o",
  ];
  return chatPrefixes.some((prefix) => modelId.startsWith(prefix));
}

/**
 * Build a model summary from a model ID using centralized profiles.
 */
function buildModelSummary(modelId: string): OpenAIModelSummary {
  const profile = getModelProfile(modelId);
  const limits = getModelTokenLimits(modelId);

  const name = modelId
    .replace(/^gpt-/, "GPT-")
    .replace(/^o(\d)/, "O$1");

  return {
    id: modelId,
    maxInputTokens: limits.maxInputTokens,
    maxOutputTokens: limits.maxOutputTokens,
    name,
    supportsTools: profile.supportsToolCalling,
    supportsVision: profile.supportsVision,
  };
}
