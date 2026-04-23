import type { ChatCompletionTool, ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";
import type { LanguageModelChatTool } from "vscode";
import { type LanguageModelChatProvider, LanguageModelChatToolMode } from "vscode";

import { logger } from "../logger";
import { convertSchema } from "./schema";

interface ToolConfig {
  tools: ChatCompletionTool[];
  toolChoice?: ChatCompletionToolChoiceOption;
}

/**
 * Convert VSCode tools to OpenAI Chat Completions tool format.
 */
export function convertTools(
  options: Parameters<LanguageModelChatProvider["provideLanguageModelChatResponse"]>[2],
): ToolConfig | undefined {
  if (!options.tools || options.tools.length === 0) {
    return undefined;
  }

  logger.debug(`Converting ${options.tools.length} tools`);

  const tools: ChatCompletionTool[] = options.tools.map(
    (tool: LanguageModelChatTool): ChatCompletionTool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: convertSchema(tool.inputSchema),
      },
    }),
  );

  const config: ToolConfig = { tools };

  // Map VSCode tool mode to OpenAI tool_choice
  if (options.toolMode !== undefined) {
    if (options.toolMode === LanguageModelChatToolMode.Required) {
      config.toolChoice = "required";
    } else if (options.toolMode === LanguageModelChatToolMode.Auto) {
      config.toolChoice = "auto";
    }
  }

  logger.debug("Tool configuration created successfully");
  return config;
}
