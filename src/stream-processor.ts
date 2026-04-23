import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import * as vscode from "vscode";
import type { CancellationToken, LanguageModelResponsePart, Progress } from "vscode";

import { logger } from "./logger";
import { ToolBuffer } from "./tool-buffer";

export class StreamProcessor {
  async processStream(
    stream: AsyncIterable<ChatCompletionChunk>,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
  ): Promise<void> {
    const toolBuffer = new ToolBuffer();
    toolBuffer.clear();

    let hasEmittedContent = false;
    let finishReason: null | string = null;

    logger.info("[Stream Processor] Starting stream processing");

    try {
      for await (const chunk of stream) {
        if (token.isCancellationRequested) {
          logger.info("[Stream Processor] Cancellation requested");
          break;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;
        finishReason = choice.finish_reason;

        // Handle text content
        if (delta.content) {
          progress.report(new vscode.LanguageModelTextPart(delta.content));
          hasEmittedContent = true;
        }

        // Handle tool calls (streamed incrementally)
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            // First chunk for this tool call has id and function name
            if (toolCallDelta.id && toolCallDelta.function?.name) {
              toolBuffer.startTool(index, toolCallDelta.id, toolCallDelta.function.name);
              logger.debug("[Stream Processor] Tool call started", {
                index,
                name: toolCallDelta.function.name,
                toolCallId: toolCallDelta.id,
              });
            }

            // Accumulate function arguments
            if (toolCallDelta.function?.arguments) {
              toolBuffer.appendInput(index, toolCallDelta.function.arguments);
            }
          }
        }

        // When finish_reason is "tool_calls", finalize all pending tool calls
        if (finishReason === "tool_calls") {
          this.emitPendingToolCalls(toolBuffer, progress);
        }
      }

      // Finalize any remaining tool calls (safety net)
      this.emitPendingToolCalls(toolBuffer, progress);

      // Handle empty responses
      if (!hasEmittedContent && !token.isCancellationRequested && finishReason === "stop") {
        logger.warn("[Stream Processor] Model returned empty response");
        progress.report(
          new vscode.LanguageModelTextPart(
            "*(The model returned an empty response. Please try again or rephrase your request.)*",
          ),
        );
      }

      logger.info("[Stream Processor] Stream processing complete", { finishReason });
    } catch (error) {
      if (token.isCancellationRequested) {
        logger.info("[Stream Processor] Stream cancelled");
        return;
      }
      logger.error("[Stream Processor] Error during stream processing", error);
      throw error;
    }
  }

  /**
   * Emit all pending tool calls from the buffer.
   * OpenAI streams tool call arguments incrementally, so we finalize
   * and emit them once we see finish_reason="tool_calls" or at stream end.
   */
  private emitPendingToolCalls(
    toolBuffer: ToolBuffer,
    progress: Progress<LanguageModelResponsePart>,
  ): void {
    // Finalize tool calls for indices 0..N
    // We try indices sequentially until we stop finding tools
    for (let i = 0; i < 128; i++) {
      if (toolBuffer.isEmitted(i)) continue;

      const tool = toolBuffer.finalizeTool(i);
      if (!tool) continue;

      logger.debug("[Stream Processor] Emitting tool call", {
        index: i,
        toolCallId: tool.id,
        toolName: tool.name,
      });

      progress.report(
        new vscode.LanguageModelToolCallPart(tool.id, tool.name, tool.input as object),
      );
      toolBuffer.markEmitted(i);
    }
  }
}
