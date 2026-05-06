import type { JsonValue } from "type-fest" with { "resolution-mode": "import" };

import { logger } from "./logger";

interface ToolCall {
  callId: string;
  input: unknown;
  itemId: string;
  name: string;
}

/**
 * Buffers streaming function-call arguments coming from the Responses API.
 *
 * Responses API streams function-call arguments via
 * `response.function_call_arguments.delta` events keyed by `item_id`.
 * The terminating `response.function_call_arguments.done` event carries the
 * full argument string and the function `name`.
 *
 * Each tool call in a single response gets a unique `item_id`.
 */
export class ToolBuffer {
  private readonly emittedItemIds = new Set<string>();
  private readonly inputBuffers = new Map<string, string>();
  private readonly tools = new Map<string, ToolCall>();

  appendInput(itemId: string, inputChunk: string): void {
    const current = this.inputBuffers.get(itemId) ?? "";
    this.inputBuffers.set(itemId, current + inputChunk);
  }

  clear(): void {
    this.tools.clear();
    this.inputBuffers.clear();
    this.emittedItemIds.clear();
  }

  clearInput(itemId: string): void {
    this.inputBuffers.set(itemId, "");
  }

  finalizeTool(itemId: string): ToolCall | undefined {
    const tool = this.tools.get(itemId);
    if (!tool) {
      return undefined;
    }

    const inputStr = this.inputBuffers.get(itemId) ?? "";
    try {
      tool.input =
        inputStr.length > 0 ? (JSON.parse(inputStr) as JsonValue) : {};
    } catch {
      logger.warn(
        "[ToolBuffer] Failed to parse tool input JSON, skipping tool call",
        {
          inputLength: inputStr.length,
          itemId,
          toolCallId: tool.callId,
          toolName: tool.name,
        },
      );
      this.tools.delete(itemId);
      this.inputBuffers.delete(itemId);
      return undefined;
    }

    this.tools.delete(itemId);
    this.inputBuffers.delete(itemId);
    return tool;
  }

  isEmitted(itemId: string): boolean {
    return this.emittedItemIds.has(itemId);
  }

  markEmitted(itemId: string): void {
    this.emittedItemIds.add(itemId);
  }

  pendingItemIds(): string[] {
    return [...this.tools.keys()];
  }

  startTool(itemId: string, callId: string, name: string): void {
    this.tools.set(itemId, { callId, input: {}, itemId, name });
    if (!this.inputBuffers.has(itemId)) {
      this.inputBuffers.set(itemId, "");
    }
  }
}
