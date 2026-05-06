import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import * as vscode from "vscode";
import type {
  CancellationToken,
  LanguageModelResponsePart,
  Progress,
} from "vscode";

import { logger } from "./logger";
import { ToolBuffer } from "./tool-buffer";

export interface StreamResult {
  /** Final response id (from response.completed). Used for `previous_response_id`. */
  responseId?: string;
  /** Whether the stream emitted any content (text or tool calls). */
  emittedAnyContent: boolean;
  /** Final status if the response surfaced one. */
  status?: string;
}

export class StreamProcessor {
  /**
   * Process a /v1/responses streaming event source.
   *
   * Maps:
   * - response.output_text.delta -> LanguageModelTextPart (always shown)
   * - response.reasoning_text.delta -> LanguageModelTextPart, prefixed once with
   *   a header so users can tell it apart from the final answer
   *   (controlled by `showReasoning`)
   * - response.function_call_arguments.delta -> ToolBuffer.appendInput
   * - response.output_item.added with type=function_call -> ToolBuffer.startTool
   * - response.function_call_arguments.done -> finalize and emit tool call
   * - response.completed -> capture final response id, end loop
   * - response.failed / error -> throw
   */
  async processStream(
    stream: AsyncIterable<ResponseStreamEvent>,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
    options: { showReasoning: boolean },
  ): Promise<StreamResult> {
    const toolBuffer = new ToolBuffer();
    let emittedAnyContent = false;
    let responseId: string | undefined;
    let status: string | undefined;
    let reasoningHeaderShown = false;
    let answerStarted = false;

    logger.info("[Stream Processor] Starting Responses stream processing");

    try {
      for await (const event of stream) {
        if (token.isCancellationRequested) {
          logger.info("[Stream Processor] Cancellation requested");
          break;
        }

        switch (event.type) {
          case "response.created":
          case "response.in_progress":
          case "response.queued": {
            responseId = event.response.id ?? responseId;
            break;
          }

          case "response.output_text.delta": {
            if (
              options.showReasoning &&
              reasoningHeaderShown &&
              !answerStarted
            ) {
              progress.report(new vscode.LanguageModelTextPart("\n\n---\n\n"));
              answerStarted = true;
            }
            progress.report(new vscode.LanguageModelTextPart(event.delta));
            emittedAnyContent = true;
            break;
          }

          case "response.reasoning_text.delta":
          case "response.reasoning_summary_text.delta": {
            if (!options.showReasoning) {
              break;
            }
            if (!reasoningHeaderShown) {
              progress.report(
                new vscode.LanguageModelTextPart("**Reasoning**\n\n"),
              );
              reasoningHeaderShown = true;
            }
            progress.report(new vscode.LanguageModelTextPart(event.delta));
            emittedAnyContent = true;
            break;
          }

          case "response.refusal.delta": {
            progress.report(new vscode.LanguageModelTextPart(event.delta));
            emittedAnyContent = true;
            break;
          }

          case "response.output_item.added": {
            const item = event.item;
            if (item.type === "function_call") {
              const itemId = item.id ?? `item-${event.output_index}`;
              toolBuffer.startTool(itemId, item.call_id, item.name);
              if (item.arguments && item.arguments.length > 0) {
                toolBuffer.appendInput(itemId, item.arguments);
              }
              logger.debug("[Stream Processor] Function call started", {
                callId: item.call_id,
                itemId,
                name: item.name,
              });
            }
            break;
          }

          case "response.function_call_arguments.delta": {
            toolBuffer.appendInput(event.item_id, event.delta);
            break;
          }

          case "response.function_call_arguments.done": {
            // The "done" event carries the full arguments and the name. If
            // we missed `output_item.added` (rare), seed the buffer here.
            if (!toolBuffer.pendingItemIds().includes(event.item_id)) {
              const callId = `call_${event.item_id}`;
              toolBuffer.startTool(event.item_id, callId, event.name);
            }
            // Replace the buffered fragments with the canonical full string
            // so partial deltas plus a final repeat do not double-up.
            toolBuffer.clearInput(event.item_id);
            toolBuffer.appendInput(event.item_id, event.arguments);
            this.emitToolCall(event.item_id, toolBuffer, progress);
            emittedAnyContent = true;
            break;
          }

          case "response.completed": {
            responseId = event.response.id ?? responseId;
            status = event.response.status ?? status;
            break;
          }

          case "response.incomplete": {
            responseId = event.response.id ?? responseId;
            status = event.response.status ?? "incomplete";
            const reason = event.response.incomplete_details?.reason;
            logger.warn("[Stream Processor] Response incomplete", { reason });
            break;
          }

          case "response.failed": {
            responseId = event.response.id ?? responseId;
            status = "failed";
            const message =
              event.response.error?.message ?? "Response generation failed";
            throw new Error(message);
          }

          case "error": {
            const e = event as unknown as {
              code?: string;
              message?: string;
            };
            throw new Error(
              `${e.code ?? "stream_error"}: ${e.message ?? "Unknown stream error"}`,
            );
          }

          default: {
            // Ignore other lifecycle events (output_item.done for messages,
            // content_part.added/done, web_search/file_search/mcp/etc.)
            break;
          }
        }
      }

      // Safety net: emit any pending tool calls that never got a `done` event.
      for (const itemId of toolBuffer.pendingItemIds()) {
        this.emitToolCall(itemId, toolBuffer, progress);
        emittedAnyContent = true;
      }

      if (!emittedAnyContent && !token.isCancellationRequested) {
        logger.warn("[Stream Processor] Model returned empty response");
        progress.report(
          new vscode.LanguageModelTextPart(
            "*(The model returned an empty response. Please try again or rephrase your request.)*",
          ),
        );
      }

      logger.info("[Stream Processor] Stream processing complete", {
        responseId,
        status,
      });

      return { emittedAnyContent, responseId, status };
    } catch (error) {
      if (token.isCancellationRequested) {
        logger.info("[Stream Processor] Stream cancelled");
        return { emittedAnyContent, responseId, status };
      }
      logger.error("[Stream Processor] Error during stream processing", error);
      throw error;
    }
  }

  private emitToolCall(
    itemId: string,
    toolBuffer: ToolBuffer,
    progress: Progress<LanguageModelResponsePart>,
  ): void {
    if (toolBuffer.isEmitted(itemId)) return;

    const tool = toolBuffer.finalizeTool(itemId);
    if (!tool) return;

    logger.debug("[Stream Processor] Emitting tool call", {
      callId: tool.callId,
      itemId,
      name: tool.name,
    });

    progress.report(
      new vscode.LanguageModelToolCallPart(
        tool.callId,
        tool.name,
        tool.input as object,
      ),
    );
    toolBuffer.markEmitted(itemId);
  }
}
