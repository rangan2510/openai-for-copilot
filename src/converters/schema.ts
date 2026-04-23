import type { LanguageModelChatTool } from "vscode";

import { logger } from "../logger";

/**
 * Convert VSCode tool schema to JSON Schema format for OpenAI.
 *
 * VSCode already provides schemas in JSON Schema format, so we just
 * ensure a valid default if the schema is missing.
 *
 * OpenAI requires object schemas to always have a "properties" field,
 * even if empty. Tools like terminal_last_command send { type: "object" }
 * with no properties, which OpenAI rejects.
 */
export function convertSchema(
  schema: LanguageModelChatTool["inputSchema"],
): Record<string, unknown> {
  if (schema == null) {
    logger.debug("Tool schema is null/undefined, using default");
    return { type: "object", properties: {} };
  }

  const result = schema as Record<string, unknown>;

  // OpenAI requires "properties" on object schemas
  if (result.type === "object" && !result.properties) {
    result.properties = {};
  }

  logger.debug("Tool schema:", JSON.stringify(result, undefined, 2));
  return result;
}
