/**
 * Model profiles and token limits for OpenAI models.
 *
 * Every model surfaced by this extension goes through the Responses API, so:
 * - Reasoning support is the only meaningful capability flag.
 * - All requests use `max_output_tokens` (Chat Completions's
 *   `max_completion_tokens` does not apply).
 */

import type { ApiReasoningEffort } from "./settings";

export interface ModelProfile {
  /** Whether the model supports reasoning_effort (always sent via Responses `reasoning.effort`). */
  supportsReasoningEffort: boolean;
  /** Supported reasoning_effort values for this model family. */
  supportedReasoningEfforts: readonly ApiReasoningEffort[];
  /** Whether the model supports tool calling. */
  supportsToolCalling: boolean;
  /** Whether the model supports vision (image inputs). */
  supportsVision: boolean;
  /** Whether the temperature parameter is supported. */
  supportsTemperature: boolean;
}

export interface ModelTokenLimits {
  maxInputTokens: number;
  maxOutputTokens: number;
}

/**
 * Synthetic suffix appended to a model id to expose OpenAI's pro mode
 * (`reasoning.mode: "pro"`) as its own entry in the model picker. It is NOT a
 * real OpenAI model id and is stripped before any API call.
 *
 * A colon is deliberate: real OpenAI ids such as `gpt-5-pro`, `o1-pro` and
 * `o3-pro` already end in `-pro`, so a `-pro` marker would be ambiguous and
 * could make us send `reasoning.mode` to a model that rejects it. No OpenAI
 * model id contains a colon (verified against /v1/models 2026-09-09).
 */
export const PRO_MODE_SUFFIX = ":pro";

/**
 * Model families that accept `reasoning.mode: "standard" | "pro"`.
 *
 * CLI-verified 2026-09-09 against /v1/responses: a real `mode: "pro"` request
 * succeeds on `gpt-6-astra` and all three GPT-5.6 variants, and composes with
 * every supported effort level. Pro mode is OpenAI-API-only -- AWS Bedrock
 * validates the enum but rejects actual use with "`reasoning.mode` is not
 * supported with this model".
 */
const PRO_MODE_CAPABLE_PREFIXES: readonly string[] = ["gpt-6", "gpt-5.6"];

/**
 * Whether a model accepts pro mode. Takes a real (unsuffixed) model id.
 */
export function supportsProMode(modelId: string): boolean {
  if (modelId.endsWith(PRO_MODE_SUFFIX)) {
    return false;
  }
  return PRO_MODE_CAPABLE_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}

/**
 * Strip the synthetic pro-mode suffix, yielding the real OpenAI model id.
 */
export function resolveBaseModelId(modelId: string): string {
  return modelId.endsWith(PRO_MODE_SUFFIX)
    ? modelId.slice(0, -PRO_MODE_SUFFIX.length)
    : modelId;
}

/**
 * Known OpenAI models with their token limits. Models not in this map get
 * conservative defaults via longest-prefix lookup. More-specific prefixes must
 * appear before shorter ones (e.g. "gpt-5.2-pro" before "gpt-5.2").
 *
 * NOTE: `maxInputTokens` here is the model's FULL context window. The public
 * `getModelTokenLimits` subtracts `maxOutputTokens` (and any caller-supplied
 * safety margin) from it so the value handed to VS Code leaves room for the
 * response. Storing the raw window keeps these numbers easy to verify against
 * OpenAI's published specs.
 */
const MODEL_CONTEXT_WINDOWS: Record<string, ModelTokenLimits> = {
  // GPT-6 Astra: 1.05M context, 128K output (OpenAI published specs; Bedrock
  // reports a 131,072 hard output cap for the same model).
  "gpt-6-astra": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-6": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },

  // GPT-4-turbo
  "gpt-4-turbo": { maxInputTokens: 128_000, maxOutputTokens: 4_096 },

  // GPT-4o family
  "gpt-4o-mini": { maxInputTokens: 128_000, maxOutputTokens: 16_384 },
  "gpt-4o": { maxInputTokens: 128_000, maxOutputTokens: 16_384 },

  // GPT-4.1 family
  "gpt-4.1-mini": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },
  "gpt-4.1-nano": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },
  "gpt-4.1": { maxInputTokens: 1_047_576, maxOutputTokens: 32_768 },

  // GPT-5.6 family (Sol / Terra / Luna) -- all three: 1.05M context, 128K output.
  // Bare "gpt-5.6" alias routes to Sol. Longest-prefix lookup handles the -sol/
  // -terra/-luna suffixes and any dated snapshots.
  "gpt-5.6-sol": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.6-terra": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.6-luna": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },
  "gpt-5.6": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },

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
  "gpt-5.3": { maxInputTokens: 1_050_000, maxOutputTokens: 128_000 },

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
  const baseModelId = resolveBaseModelId(modelId);
  const isOSeries =
    baseModelId.startsWith("o1") ||
    baseModelId.startsWith("o3") ||
    baseModelId.startsWith("o4");
  // GPT-5.x and GPT-6.x are reasoning models: they reject `temperature` and
  // take `reasoning.effort` instead.
  const isGptReasoning =
    baseModelId.startsWith("gpt-5") || baseModelId.startsWith("gpt-6");
  const isReasoningModel = isGptReasoning || isOSeries;

  return {
    supportsReasoningEffort: isReasoningModel,
    supportedReasoningEfforts: getSupportedReasoningEfforts(baseModelId),
    supportsTemperature: !isReasoningModel,
    supportsToolCalling: true,
    supportsVision: !isOSeries,
  };
}

function getSupportedReasoningEfforts(
  modelId: string,
): readonly ApiReasoningEffort[] {
  // GPT-6 Astra spans low..max but rejects BOTH "none" and "minimal"
  // (CLI-verified 2026-09-09: "Unsupported value: 'none' is not supported with
  // the 'gpt-6-astra' model"). This is the one place it differs from GPT-5.6.
  if (modelId.startsWith("gpt-6")) {
    return ["low", "medium", "high", "xhigh", "max"];
  }

  // GPT-5.6 (Sol/Terra/Luna) adds the "max" reasoning effort on top of xhigh.
  if (modelId.startsWith("gpt-5.6")) {
    return ["none", "low", "medium", "high", "xhigh", "max"];
  }

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

/**
 * Resolve the effective token limits for a model.
 *
 * The returned `maxInputTokens` is the model's context window minus its output
 * budget minus `safetyMargin`, so `input + output` stays clear of the hard
 * ceiling. VS Code 1.120+ enforces the reported limits when packing BYOK
 * conversations, and this extension counts tokens with a char/4 estimate that
 * can undercount, so the reservation prevents context-overflow errors on the
 * large-window (400K/1M) GPT-5.x and GPT-4.1 models.
 *
 * @param modelId The OpenAI model id.
 * @param safetyMargin Extra tokens reserved on top of the output budget.
 *   Default 0. Floored so it never shrinks the window below a usable minimum.
 */
export function getModelTokenLimits(
  modelId: string,
  safetyMargin = 0,
): ModelTokenLimits {
  const window = resolveContextWindow(modelId);

  const rawInput =
    window.maxInputTokens - window.maxOutputTokens - safetyMargin;
  // Never drop the input window below a usable floor (25% of the context
  // window or 8K, whichever is larger) even if margin + output are huge.
  const floor = Math.max(8_000, Math.floor(window.maxInputTokens * 0.25));

  return {
    maxInputTokens: Math.max(floor, rawInput),
    maxOutputTokens: window.maxOutputTokens,
  };
}

/**
 * Look up a model's full context window (input side = window, before reserving
 * output/margin). Falls back to longest-prefix match, then a conservative default.
 */
function resolveContextWindow(modelId: string): ModelTokenLimits {
  const baseModelId = resolveBaseModelId(modelId);

  if (MODEL_CONTEXT_WINDOWS[baseModelId]) {
    return MODEL_CONTEXT_WINDOWS[baseModelId];
  }

  let bestMatch: ModelTokenLimits | undefined;
  let bestLength = 0;

  for (const [knownId, limits] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (baseModelId.startsWith(knownId) && knownId.length > bestLength) {
      bestMatch = limits;
      bestLength = knownId.length;
    }
  }

  return bestMatch ?? { maxInputTokens: 128_000, maxOutputTokens: 4096 };
}
