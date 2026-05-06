/**
 * Model profiles and token limits for OpenAI models.
 *
 * OpenAI's API is more uniform than Bedrock's, so profiles are simpler.
 * The main distinctions are:
 * - Reasoning models (GPT-5+ and o-series) support reasoning_effort but not temperature
 * - Vision support varies by model
 * - Token limits differ per model
 */

import type { ApiReasoningEffort } from "./settings";

export interface ModelProfile {
  /** Whether the model supports reasoning_effort parameter */
  supportsReasoningEffort: boolean;
  /** Supported reasoning_effort values for this model family */
  supportedReasoningEfforts: readonly ApiReasoningEffort[];
  /** Whether the model supports tool calling */
  supportsToolCalling: boolean;
  /** Whether the model supports vision (image inputs) */
  supportsVision: boolean;
  /** Whether the temperature parameter is supported */
  supportsTemperature: boolean;
  /** Whether the model requires max_completion_tokens instead of max_tokens */
  useMaxCompletionTokens: boolean;
}

export interface ModelTokenLimits {
  maxInputTokens: number;
  maxOutputTokens: number;
}

/**
 * Known OpenAI models with their token limits.
 * Models not in this map get conservative defaults.
 * More-specific prefixes must appear before shorter ones that share the same
 * leading characters (e.g. "gpt-5.2-pro" before "gpt-5.2") so that the
 * longest-prefix lookup in getModelTokenLimits always returns the best match.
 */
const MODEL_TOKEN_LIMITS: Record<string, ModelTokenLimits> = {
  // GPT-4-turbo
  "gpt-4-turbo": { maxInputTokens: 128_000, maxOutputTokens: 4_096 },

  // GPT-4o family
  "gpt-4o-mini": { maxInputTokens: 128_000, maxOutputTokens: 16_384 },
  "gpt-4o": { maxInputTokens: 128_000, maxOutputTokens: 16_384 },

  // GPT-4.1 family
  "gpt-4.1-mini": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },
  "gpt-4.1-nano": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },
  "gpt-4.1": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },

  // GPT-5 family
  "gpt-5-pro": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },
  "gpt-5-mini": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },
  "gpt-5-nano": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },
  "gpt-5": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },

  // GPT-5.1
  "gpt-5.1": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },

  // GPT-5.2
  "gpt-5.2-pro": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },
  "gpt-5.2": { maxInputTokens: 400_000, maxOutputTokens: 128_000 },

  // GPT-5.3
  "gpt-5.3": { maxInputTokens: 1_047_576, maxOutputTokens: 65_536 },

  // GPT-5.4
  "gpt-5.4-pro": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.4-mini": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.4-nano": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.4": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },

  // GPT-5.5
  "gpt-5.5-pro": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.5-mini": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.5-nano": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.5": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },

  // o1-series reasoning models
  "o1-pro": { maxInputTokens: 200_000, maxOutputTokens: 100_000 },
  o1: { maxInputTokens: 200_000, maxOutputTokens: 100_000 },

  // o3-series reasoning models
  "o3-pro": { maxInputTokens: 200_000, maxOutputTokens: 100_000 },
  "o3-mini": { maxInputTokens: 200_000, maxOutputTokens: 100_000 },
  o3: { maxInputTokens: 200_000, maxOutputTokens: 100_000 },

  // o4-series reasoning models
  "o4-mini": { maxInputTokens: 200_000, maxOutputTokens: 100_000 },
};

export function getModelProfile(modelId: string): ModelProfile {
  const isGpt5Model = modelId.startsWith("gpt-5");
  const isReasoningModel =
    isGpt5Model ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4");

  // GPT-5+ and o-series require max_completion_tokens; GPT-4 family uses max_tokens
  const isNewModel = isReasoningModel;

  return {
    supportsReasoningEffort: isReasoningModel,
    supportedReasoningEfforts: getSupportedReasoningEfforts(modelId),
    supportsTemperature: !isNewModel,
    supportsToolCalling: true,
    supportsVision: !modelId.startsWith("o"),
    useMaxCompletionTokens: isNewModel,
  };
}

function getSupportedReasoningEfforts(
  modelId: string,
): readonly ApiReasoningEffort[] {
  if (
    modelId.startsWith("gpt-5.2") ||
    modelId.startsWith("gpt-5.4") ||
    modelId.startsWith("gpt-5.5")
  ) {
    return ["none", "low", "medium", "high", "xhigh"];
  }

  if (modelId.startsWith("gpt-5.1")) {
    return ["none", "low", "medium", "high"];
  }

  if (modelId.startsWith("gpt-5")) {
    return ["minimal", "low", "medium", "high"];
  }

  if (
    modelId.startsWith("o1") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4")
  ) {
    return ["low", "medium", "high"];
  }

  return [];
}

export function getModelTokenLimits(modelId: string): ModelTokenLimits {
  // Check exact match first
  if (MODEL_TOKEN_LIMITS[modelId]) {
    return MODEL_TOKEN_LIMITS[modelId];
  }

  // Find the longest matching prefix for best specificity
  // (e.g. "gpt-5.2-pro-2025-12-11" matches "gpt-5.2-pro" over "gpt-5.2")
  let bestMatch: ModelTokenLimits | undefined;
  let bestLength = 0;

  for (const [knownId, limits] of Object.entries(MODEL_TOKEN_LIMITS)) {
    if (modelId.startsWith(knownId) && knownId.length > bestLength) {
      bestMatch = limits;
      bestLength = knownId.length;
    }
  }

  return bestMatch ?? { maxInputTokens: 128_000, maxOutputTokens: 4096 };
}
