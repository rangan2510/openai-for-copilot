import type { JsonValue } from "type-fest" with { "resolution-mode": "import" };

import { logger } from "./logger";

interface ToolCall {
  id: string;
  input: unknown;
  name: string;
}

export class ToolBuffer {
  private readonly emittedIndices = new Set<number>();
  private readonly inputBuffers = new Map<number, string>();
  private readonly tools = new Map<number, ToolCall>();

  appendInput(index: number, inputChunk: string): void {
    const current = this.inputBuffers.get(index) ?? "";
    this.inputBuffers.set(index, current + inputChunk);
  }

  clear(): void {
    this.tools.clear();
    this.inputBuffers.clear();
    this.emittedIndices.clear();
  }

  finalizeTool(index: number): ToolCall | undefined {
    const tool = this.tools.get(index);
    const inputStr = this.inputBuffers.get(index);

    if (!tool || !inputStr) {
      return undefined;
    }

    try {
      tool.input = JSON.parse(inputStr) as JsonValue;
    } catch {
      logger.warn("[ToolBuffer] Failed to parse tool input JSON, skipping tool call", {
        inputLength: inputStr.length,
        toolId: tool.id,
        toolName: tool.name,
      });
      this.tools.delete(index);
      this.inputBuffers.delete(index);
      return undefined;
    }

    this.tools.delete(index);
    this.inputBuffers.delete(index);

    return tool;
  }

  isEmitted(index: number): boolean {
    return this.emittedIndices.has(index);
  }

  markEmitted(index: number): void {
    this.emittedIndices.add(index);
  }

  startTool(index: number, id: string, name: string): void {
    this.tools.set(index, { id, input: {}, name });
    this.inputBuffers.set(index, "");
  }
}
