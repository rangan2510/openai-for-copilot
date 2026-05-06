import type {
  ResponseCreateParamsStreaming,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import type {
  CancellationToken,
  LanguageModelChatInformation,
  LanguageModelChatMessage,
  LanguageModelChatProvider,
  LanguageModelResponsePart,
  Progress,
} from "vscode";
import * as vscode from "vscode";

import { ConversationIndex } from "./conversation-index";
import { convertMessages } from "./converters/messages";
import { convertTools } from "./converters/tools";
import { logger } from "./logger";
import { OpenAIAPIClient } from "./openai-client";
import { getModelProfile, getModelTokenLimits } from "./profiles";
import type { ApiReasoningEffort } from "./settings";
import { getOpenAISettings } from "./settings";
import { StreamProcessor } from "./stream-processor";
import { validateInput } from "./validation";

export class OpenAIChatModelProvider
  implements vscode.Disposable, LanguageModelChatProvider
{
  private readonly _onDidChangeLanguageModelInformation =
    new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelInformation =
    this._onDidChangeLanguageModelInformation.event;

  private client: OpenAIAPIClient | undefined;
  private initialFetchComplete = false;
  private readonly streamProcessor: StreamProcessor;
  private readonly conversationIndex: ConversationIndex;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.streamProcessor = new StreamProcessor();
    this.conversationIndex = new ConversationIndex();
  }

  public dispose(): void {
    try {
      this._onDidChangeLanguageModelInformation.dispose();
    } catch {
      // ignore
    }
    this.conversationIndex.clear();
  }

  public isInitialFetchComplete(): boolean {
    return this.initialFetchComplete;
  }

  public notifyModelInformationChanged(reason?: string): void {
    const suffix = reason ? `: ${reason}` : "";
    logger.debug(`[OpenAI Provider] Signaling model info refresh${suffix}`);
    this._onDidChangeLanguageModelInformation.fire();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    token: CancellationToken,
  ): Promise<LanguageModelChatInformation[]> {
    const apiKey = await this.secrets.get("openai-for-copilot.apiKey");

    if (!apiKey) {
      if (!options.silent) {
        const action = await vscode.window.showInformationMessage(
          "OpenAI for Copilot requires an API key. Would you like to configure it now?",
          "Set API Key",
          "Cancel",
        );

        if (action === "Set API Key") {
          await vscode.commands.executeCommand("openai-for-copilot.manage");
          return [];
        }
      }
      return [];
    }

    const settings = getOpenAISettings();
    this.client = new OpenAIAPIClient(
      apiKey,
      settings.baseUrl,
      settings.organization,
    );

    try {
      const abortController = new AbortController();
      const cancellationListener = token.onCancellationRequested(() => {
        abortController.abort();
      });

      try {
        const fetchModels = async (
          progress?: vscode.Progress<{ message?: string }>,
        ): Promise<LanguageModelChatInformation[]> => {
          progress?.report({ message: "Fetching OpenAI models..." });

          const models = await this.client!.fetchModels(abortController.signal);

          progress?.report({ message: "Building model list..." });

          const infos: LanguageModelChatInformation[] = models.map((model) => {
            const limits = getModelTokenLimits(model.id);
            const profile = getModelProfile(model.id);

            return {
              capabilities: {
                imageInput: profile.supportsVision,
                toolCalling: profile.supportsToolCalling,
              },
              family: "openai-for-copilot",
              id: model.id,
              maxInputTokens: limits.maxInputTokens,
              maxOutputTokens: limits.maxOutputTokens,
              name: model.name,
              tooltip: [
                `OpenAI - ${model.id}`,
                `Input limit: ${formatTokenLimit(limits.maxInputTokens)} tokens`,
                `Output limit: ${formatTokenLimit(limits.maxOutputTokens)} tokens`,
              ].join("\n"),
              version: "1.0.0",
            };
          });

          if (infos.length === 0) {
            throw new Error("No Responses-capable OpenAI models found");
          }

          infos.sort((a, b) => a.name.localeCompare(b.name));

          this.initialFetchComplete = true;
          return infos;
        };

        if (options.silent) {
          return await fetchModels();
        }

        return await vscode.window.withProgress(
          {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: "Loading OpenAI models",
          },
          fetchModels,
        );
      } finally {
        cancellationListener.dispose();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.info("[OpenAI Provider] Model fetch cancelled by user");
        return [];
      }

      if (!options.silent) {
        logger.error("[OpenAI Provider] Failed to fetch models", error);
        vscode.window.showErrorMessage(
          `Failed to fetch OpenAI models: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return [];
    }
  }

  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatMessage[],
    options: Parameters<
      LanguageModelChatProvider["provideLanguageModelChatResponse"]
    >[2],
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
  ): Promise<void> {
    if (!this.client) {
      throw new Error(
        "OpenAI client not initialized. Please configure your API key.",
      );
    }

    try {
      const settings = getOpenAISettings();
      const modelProfile = getModelProfile(model.id);

      const sessionKey = ConversationIndex.computeKey(messages);

      // Decide whether we can ride a stored conversation. If yes, send only
      // the new tail of the message list and pass `previous_response_id`.
      let inputMessages: readonly LanguageModelChatMessage[] = messages;
      let previousResponseId: string | undefined;

      if (settings.storeConversations && sessionKey) {
        const cached = this.conversationIndex.lookup(
          sessionKey,
          messages.length,
        );
        if (cached) {
          inputMessages = messages.slice(cached.skipCount);
          previousResponseId = cached.responseId;
          logger.debug("[OpenAI Provider] Resuming stored conversation", {
            previousResponseId,
            skipCount: cached.skipCount,
            tailMessages: inputMessages.length,
          });
        }
      }

      const converted = convertMessages(inputMessages);
      validateInput(converted.input, converted.instructions);

      const toolConfig = convertTools(options);

      const maxTokens =
        typeof options.modelOptions?.max_tokens === "number"
          ? options.modelOptions.max_tokens
          : model.maxOutputTokens;

      const requestParams: ResponseCreateParamsStreaming = {
        model: model.id,
        input: converted.input as ResponseInputItem[],
        stream: true,
        store: settings.storeConversations,
        max_output_tokens: maxTokens,
      };

      if (converted.instructions) {
        requestParams.instructions = converted.instructions;
      }

      if (previousResponseId) {
        requestParams.previous_response_id = previousResponseId;
      }

      if (modelProfile.supportsTemperature) {
        requestParams.temperature =
          typeof options.modelOptions?.temperature === "number"
            ? options.modelOptions.temperature
            : 0.7;
      }

      if (modelProfile.supportsReasoningEffort) {
        const effort = resolveReasoningEffort(
          settings.reasoningEffort,
          modelProfile.supportedReasoningEfforts,
        );
        if (effort) {
          requestParams.reasoning = { effort };
        }
      }

      if (toolConfig) {
        requestParams.tools = toolConfig.tools;
        if (toolConfig.toolChoice) {
          requestParams.tool_choice = toolConfig.toolChoice;
        }
      }

      if (typeof options.modelOptions?.top_p === "number") {
        requestParams.top_p = options.modelOptions.top_p;
      }

      logger.info("[OpenAI Provider] Sending /v1/responses request", {
        hasPreviousResponseId: Boolean(previousResponseId),
        modelId: model.id,
        store: settings.storeConversations,
        toolCount: toolConfig?.tools.length ?? 0,
        inputItems: converted.input.length,
      });

      const abortController = new AbortController();
      const cancellationListener = token.onCancellationRequested(() => {
        abortController.abort();
      });

      try {
        const stream = await this.client.startResponsesStream(
          requestParams,
          abortController.signal,
        );

        const result = await this.streamProcessor.processStream(
          stream,
          progress,
          token,
          { showReasoning: settings.showReasoning },
        );

        if (
          settings.storeConversations &&
          sessionKey &&
          result.responseId &&
          !token.isCancellationRequested
        ) {
          this.conversationIndex.record(
            sessionKey,
            result.responseId,
            messages.length,
          );
        }

        logger.info("[OpenAI Provider] Chat request completed");
      } finally {
        cancellationListener.dispose();
      }
    } catch (error) {
      logger.error("[OpenAI Provider] Chat request failed", {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : String(error),
        modelId: model.id,
      });

      // If the server rejected our previous_response_id (e.g. it was deleted
      // or store was disabled mid-conversation), drop the cache entry so the
      // next attempt starts fresh.
      const sessionKey = ConversationIndex.computeKey(messages);
      if (
        sessionKey &&
        error instanceof Error &&
        /previous_response_id/i.test(error.message)
      ) {
        this.conversationIndex.invalidate(sessionKey);
      }

      throw error;
    }
  }

  async provideTokenCount(
    _model: LanguageModelChatInformation,
    text: LanguageModelChatMessage | string,
    _token: CancellationToken,
  ): Promise<number> {
    // Simple estimation: ~4 characters per token. OpenAI does not expose a
    // dedicated token-counting endpoint; tiktoken would add weight without
    // adding much value for the way Copilot uses these counts.
    if (typeof text === "string") {
      return Math.ceil(text.length / 4);
    }

    let totalChars = 0;
    for (const part of text.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        totalChars += part.value.length;
      }
    }
    return Math.ceil(totalChars / 4);
  }
}

function resolveReasoningEffort(
  configuredEffort: string,
  supportedEfforts: readonly ApiReasoningEffort[],
): ApiReasoningEffort | undefined {
  if (configuredEffort === "model-default" || supportedEfforts.length === 0) {
    return undefined;
  }

  if (supportedEfforts.includes(configuredEffort as ApiReasoningEffort)) {
    return configuredEffort as ApiReasoningEffort;
  }

  logger.warn(
    `[OpenAI Provider] Reasoning effort "${configuredEffort}" is not supported by this model; using model default`,
  );
  return undefined;
}

function formatTokenLimit(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
