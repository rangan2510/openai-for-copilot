import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import * as vscode from "vscode";

import { logger } from "../logger";

interface ConvertedMessages {
  messages: ChatCompletionMessageParam[];
}

/**
 * Convert VSCode language model messages to OpenAI Chat Completions API format.
 *
 * VSCode roles: User, Assistant, (System via LanguageModelChatMessageRole)
 * OpenAI roles: system, developer, user, assistant, tool
 *
 * Content parts mapping:
 * - LanguageModelTextPart -> { type: "text", text }
 * - LanguageModelToolCallPart -> assistant message with tool_calls
 * - LanguageModelToolResultPart -> { role: "tool", tool_call_id, content }
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatMessage[],
): ConvertedMessages {
  const openaiMessages: ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === vscode.LanguageModelChatMessageRole.User) {
      const converted = processUserMessage(msg);
      if (converted) openaiMessages.push(...converted);
    } else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
      const converted = processAssistantMessage(msg);
      if (converted) openaiMessages.push(converted);
    } else {
      // System messages
      const text = extractTextContent(msg);
      if (text) {
        openaiMessages.push({ role: "system", content: text });
      }
    }
  }

  logger.trace("[Message Converter] Converted messages:", {
    count: openaiMessages.length,
  });

  return { messages: openaiMessages };
}

/**
 * Process a user message. May produce multiple OpenAI messages if it contains
 * tool results interleaved with text.
 */
function processUserMessage(msg: vscode.LanguageModelChatMessage): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  const contentParts: ChatCompletionContentPart[] = [];
  const toolResults: ChatCompletionMessageParam[] = [];

  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      contentParts.push({ type: "text", text: part.value });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      // Tool results become separate "tool" role messages in OpenAI format
      const toolContent =
        typeof part.content === "string"
          ? part.content
          : JSON.stringify(part.content);
      toolResults.push({
        role: "tool" as const,
        tool_call_id: part.callId,
        content: toolContent,
      });
    } else if (isImagePart(part)) {
      // Handle image parts
      const imageUrl = extractImageUrl(part);
      if (imageUrl) {
        contentParts.push({
          type: "image_url",
          image_url: { url: imageUrl },
        });
      }
    }
  }

  // Emit tool results first (they must follow the assistant tool_calls message)
  if (toolResults.length > 0) {
    result.push(...toolResults);
  }

  // Then emit user text/image content if any
  if (contentParts.length > 0) {
    result.push({ role: "user", content: contentParts });
  }

  return result;
}

/**
 * Process an assistant message. Extracts text and tool calls.
 */
function processAssistantMessage(
  msg: vscode.LanguageModelChatMessage,
): ChatCompletionMessageParam | undefined {
  let textContent = "";
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      textContent += part.value;
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      toolCalls.push({
        id: part.callId,
        type: "function",
        function: {
          name: part.name,
          arguments:
            typeof part.input === "string" ? part.input : JSON.stringify(part.input),
        },
      });
    }
  }

  if (toolCalls.length > 0) {
    return {
      role: "assistant",
      content: textContent || null,
      tool_calls: toolCalls,
    };
  }

  if (textContent) {
    return { role: "assistant", content: textContent };
  }

  return undefined;
}

function extractTextContent(msg: vscode.LanguageModelChatMessage): string {
  const texts: string[] = [];
  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      texts.push(part.value);
    }
  }
  return texts.join("");
}

function isImagePart(part: unknown): boolean {
  // Check for LanguageModelDataPart with image MIME type
  return (
    part !== null &&
    typeof part === "object" &&
    "data" in (part as Record<string, unknown>) &&
    "mimeType" in (part as Record<string, unknown>)
  );
}

function extractImageUrl(part: unknown): string | undefined {
  const dataPart = part as { data: Uint8Array; mimeType: string };
  if (dataPart.data && dataPart.mimeType?.startsWith("image/")) {
    const base64 = Buffer.from(dataPart.data).toString("base64");
    return `data:${dataPart.mimeType};base64,${base64}`;
  }
  return undefined;
}
