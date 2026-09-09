import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import { logger } from "./logger";
import {
  getModelProfile,
  getModelTokenLimits,
  PRO_MODE_SUFFIX,
  supportsProMode,
} from "./profiles";
import type { AuthConfig, OpenAIModelSummary } from "./types";

/**
 * Wrapper around the OpenAI SDK client.
 *
 * This extension uses the Responses API (`/v1/responses`) exclusively because:
 * - GPT-5.x rejects `reasoning_effort` alongside function tools on Chat Completions.
 * - Responses API exposes first-class reasoning streaming and stored conversations.
 * - Legacy Chat Completions-only models (e.g. `chatgpt-4o-latest`, ancient 3.5 variants)
 *   are deliberately hidden from the model picker in `isResponsesChatModel`.
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
   * Filters to Responses-capable chat models only.
   */
  async fetchModels(abortSignal?: AbortSignal): Promise<OpenAIModelSummary[]> {
    const models: OpenAIModelSummary[] = [];

    try {
      const response = await this.client.models.list({ signal: abortSignal });

      for await (const model of response) {
        if (!isResponsesChatModel(model.id)) {
          continue;
        }

        models.push(buildModelSummary(model.id));

        // Models that accept `reasoning.mode: "pro"` are surfaced as a second,
        // explicitly labelled picker entry (e.g. "GPT-6 Astra Pro") rather than
        // hidden behind a setting, so the higher-cost mode is always a
        // deliberate choice. CLI-verified 2026-09-09 on gpt-6-astra and
        // gpt-5.6-sol/terra/luna.
        if (supportsProMode(model.id)) {
          models.push(buildModelSummary(`${model.id}${PRO_MODE_SUFFIX}`));
        }
      }
    } catch (error) {
      logger.error("[OpenAI Client] Failed to fetch models", error);
      throw error;
    }

    logger.info(
      `[OpenAI Client] Found ${models.length} Responses-capable chat models`,
    );
    return models;
  }

  /**
   * Start a streaming response generation on /v1/responses.
   */
  async startResponsesStream(
    params: ResponseCreateParamsStreaming,
    abortSignal?: AbortSignal,
  ): Promise<AsyncIterable<ResponseStreamEvent>> {
    return this.client.responses.create(
      { ...params, stream: true },
      { signal: abortSignal },
    );
  }
}

/**
 * Filter for models we want to surface in the Copilot Chat model picker.
 *
 * We only include models that support `/v1/responses`. Legacy Chat Completions-only
 * variants (audio, realtime, tts, transcribe, codex, deep-research, search-api,
 * image, `chatgpt-4o`, older preview aliases) are filtered out.
 */
function isResponsesChatModel(modelId: string): boolean {
  const excludedPatterns = [
    "-realtime",
    "-audio",
    "-tts",
    "-transcribe",
    "-codex",
    "-deep-research",
    "-search-api",
    "-image",
    "chatgpt-",
    "gpt-3.5",
    "gpt-4-0",
    "gpt-4-1106",
    "gpt-4-vision",
  ];
  if (excludedPatterns.some((pattern) => modelId.includes(pattern))) {
    return false;
  }

  const supportedPrefixes = [
    "gpt-4o",
    "gpt-4.1",
    "gpt-4-turbo",
    "gpt-5",
    "gpt-6",
    "o1",
    "o3",
    "o4",
  ];
  return supportedPrefixes.some((prefix) => modelId.startsWith(prefix));
}

/**
 * Build a model summary from a model ID using centralized profiles.
 *
 * `modelId` may carry the synthetic {@link PRO_MODE_SUFFIX}. That suffix is not
 * a real OpenAI model id: profiles/limits are resolved from the base id and the
 * provider strips it back off before calling the API.
 */
function buildModelSummary(modelId: string): OpenAIModelSummary {
  const isProMode = modelId.endsWith(PRO_MODE_SUFFIX);
  const baseModelId = isProMode
    ? modelId.slice(0, -PRO_MODE_SUFFIX.length)
    : modelId;

  const profile = getModelProfile(modelId);
  const limits = getModelTokenLimits(modelId);

  const name = baseModelId.replace(/^gpt-/, "GPT-").replace(/^o(\d)/, "O$1");

  return {
    baseModelId,
    id: modelId,
    isProMode,
    maxInputTokens: limits.maxInputTokens,
    maxOutputTokens: limits.maxOutputTokens,
    name: isProMode ? `${name} Pro` : name,
    supportsTools: profile.supportsToolCalling,
    supportsVision: profile.supportsVision,
  };
}
