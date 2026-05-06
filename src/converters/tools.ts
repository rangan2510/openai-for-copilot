import type {
  FunctionTool,
  ResponseCreateParams,
} from "openai/resources/responses/responses";
import type { LanguageModelChatTool } from "vscode";
import {
  type LanguageModelChatProvider,
  LanguageModelChatToolMode,
} from "vscode";

import { logger } from "../logger";
import { convertSchema } from "./schema";

interface ResponsesToolConfig {
  tools: FunctionTool[];
  toolChoice?: ResponseCreateParams["tool_choice"];
}

/**
 * Convert VSCode tools to OpenAI Responses API tool format.
 *
 * Responses uses a flat tool shape:
 *   { type: "function", name, description, parameters, strict }
 * (no nested `function:` wrapper, unlike Chat Completions).
 */
export function convertTools(
  options: Parameters<
    LanguageModelChatProvider["provideLanguageModelChatResponse"]
  >[2],
): ResponsesToolConfig | undefined {
  if (!options.tools || options.tools.length === 0) {
    return undefined;
  }

  logger.debug(`Converting ${options.tools.length} tools (Responses API)`);

  const tools: FunctionTool[] = options.tools.map(
    (tool: LanguageModelChatTool): FunctionTool => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: convertSchema(tool.inputSchema),
      strict: false,
    }),
  );

  const config: ResponsesToolConfig = { tools };

  if (options.toolMode !== undefined) {
    if (options.toolMode === LanguageModelChatToolMode.Required) {
      config.toolChoice = "required";
    } else if (options.toolMode === LanguageModelChatToolMode.Auto) {
      config.toolChoice = "auto";
    }
  }

  return config;
}
