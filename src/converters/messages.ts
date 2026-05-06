import type {
  ResponseInputItem,
  ResponseInputMessageContentList,
} from "openai/resources/responses/responses";
import * as vscode from "vscode";

import { logger } from "../logger";

/**
 * Result of converting VS Code messages into Responses API input items.
 */
export interface ConvertedResponsesInput {
  /** The full input[] array to send to /v1/responses. */
  input: ResponseInputItem[];
  /** Concatenated system/developer text; sent as the top-level `instructions` field. */
  instructions?: string;
}

/**
 * Convert VS Code chat messages into the Responses API `input[]` plus a
 * top-level `instructions` string.
 *
 * Mapping:
 * - System messages -> merged into `instructions` (Responses API first-class).
 * - User text -> { type: "message", role: "user", content: [{ type: "input_text", ... }] }.
 * - Image data parts -> { type: "input_image", image_url: dataUri, detail: "auto" }.
 * - Assistant text -> { type: "message", role: "assistant",
 *     content: [{ type: "output_text", text }] }.
 *     Responses requires `output_text` content on assistant replay.
 * - Assistant tool call -> { type: "function_call", call_id, name, arguments }.
 * - Tool result (carried on a User message from VS Code) ->
 *     { type: "function_call_output", call_id, output }.
 */
export function convertMessages(
  messages: readonly vscode.LanguageModelChatMessage[],
): ConvertedResponsesInput {
  const input: ResponseInputItem[] = [];
  const systemTexts: string[] = [];

  for (const msg of messages) {
    if (msg.role === vscode.LanguageModelChatMessageRole.User) {
      input.push(...processUserMessage(msg));
    } else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
      const parts = processAssistantMessage(msg);
      if (parts.length > 0) {
        input.push(...parts);
      }
    } else {
      // Unknown roles (legacy system proposals etc.) get folded into
      // top-level instructions, which Responses sends as a developer/system
      // message before the input items.
      const text = extractTextContent(msg);
      if (text) {
        systemTexts.push(text);
      }
    }
  }

  const instructions = systemTexts.join("\n\n").trim() || undefined;

  logger.trace("[Responses Input] Converted messages", {
    hasInstructions: Boolean(instructions),
    itemCount: input.length,
  });

  return { input, instructions };
}

function processUserMessage(
  msg: vscode.LanguageModelChatMessage,
): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  const textAndImageContent: ResponseInputMessageContentList = [];
  const toolOutputs: ResponseInputItem[] = [];

  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      textAndImageContent.push({ type: "input_text", text: part.value });
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      const output =
        typeof part.content === "string"
          ? part.content
          : JSON.stringify(part.content);
      toolOutputs.push({
        type: "function_call_output",
        call_id: part.callId,
        output,
      });
    } else if (isImagePart(part)) {
      const imageUrl = extractImageUrl(part);
      if (imageUrl) {
        textAndImageContent.push({
          type: "input_image",
          image_url: imageUrl,
          detail: "auto",
        });
      }
    }
  }

  // Tool outputs must appear before any user text response to them.
  if (toolOutputs.length > 0) {
    items.push(...toolOutputs);
  }

  if (textAndImageContent.length > 0) {
    items.push({
      type: "message",
      role: "user",
      content: textAndImageContent,
    });
  }

  return items;
}

function processAssistantMessage(
  msg: vscode.LanguageModelChatMessage,
): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  let textContent = "";

  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      textContent += part.value;
    } else if (part instanceof vscode.LanguageModelToolCallPart) {
      items.push({
        type: "function_call",
        call_id: part.callId,
        name: part.name,
        arguments:
          typeof part.input === "string"
            ? part.input
            : JSON.stringify(part.input),
      });
    }
  }

  if (textContent.length > 0) {
    items.push({
      role: "assistant",
      content: textContent,
      type: "message",
    });
  }

  return items;
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
