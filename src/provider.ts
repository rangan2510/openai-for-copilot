import type {
  CancellationToken,
  LanguageModelChatInformation,
  LanguageModelChatMessage,
  LanguageModelChatProvider,
  LanguageModelResponsePart,
  Progress,
} from "vscode";
import * as vscode from "vscode";

import { convertMessages } from "./converters/messages";
import { convertTools } from "./converters/tools";
import { logger } from "./logger";
import { OpenAIAPIClient } from "./openai-client";
import { getModelProfile, getModelTokenLimits } from "./profiles";
import { getOpenAISettings } from "./settings";
import { StreamProcessor } from "./stream-processor";
import { validateMessages } from "./validation";

export class OpenAIChatModelProvider implements vscode.Disposable, LanguageModelChatProvider {
  private readonly _onDidChangeLanguageModelInformation = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelInformation = this._onDidChangeLanguageModelInformation.event;

  private client: OpenAIAPIClient | undefined;
  private initialFetchComplete = false;
  private readonly streamProcessor: StreamProcessor;

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.streamProcessor = new StreamProcessor();
  }

  public dispose(): void {
    try {
      this._onDidChangeLanguageModelInformation.dispose();
    } catch {
      // ignore
    }
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
    this.client = new OpenAIAPIClient(apiKey, settings.baseUrl, settings.organization);

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
            throw new Error("No chat-capable OpenAI models found");
          }

          // Sort by name
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
          `Failed to fetch OpenAI models: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [];
    }
  }

  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatMessage[],
    options: Parameters<LanguageModelChatProvider["provideLanguageModelChatResponse"]>[2],
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("OpenAI client not initialized. Please configure your API key.");
    }

    try {
      const settings = getOpenAISettings();
      const modelProfile = getModelProfile(model.id);

      // Convert messages
      const converted = convertMessages(messages);
      validateMessages(converted.messages);

      // Convert tools
      const toolConfig = convertTools(options);

      // Build request parameters
      const maxTokens = typeof options.modelOptions?.max_tokens === "number"
        ? options.modelOptions.max_tokens
        : model.maxOutputTokens;

      const requestParams: Record<string, unknown> = {
        model: model.id,
        messages: converted.messages,
        stream: true,
        // GPT-5+ and o-series require max_completion_tokens; older models use max_tokens
        ...(modelProfile.useMaxCompletionTokens
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
      };

      // Add temperature (not supported by reasoning models)
      if (modelProfile.supportsTemperature) {
        requestParams.temperature =
          typeof options.modelOptions?.temperature === "number"
            ? options.modelOptions.temperature
            : 0.7;
      }

      // Add reasoning_effort for o-series models
      if (modelProfile.supportsReasoningEffort) {
        requestParams.reasoning_effort = settings.reasoningEffort;
      }

      // Add tools
      if (toolConfig) {
        requestParams.tools = toolConfig.tools;
        if (toolConfig.toolChoice) {
          requestParams.tool_choice = toolConfig.toolChoice;
        }
      }

      // Add top_p and stop if provided
      if (typeof options.modelOptions?.top_p === "number") {
        requestParams.top_p = options.modelOptions.top_p;
      }
      if (options.modelOptions?.stop) {
        requestParams.stop = options.modelOptions.stop;
      }

      logger.info("[OpenAI Provider] Sending chat request", {
        messageCount: converted.messages.length,
        modelId: model.id,
        toolCount: toolConfig?.tools.length ?? 0,
      });

      // Start streaming
      const abortController = new AbortController();
      const cancellationListener = token.onCancellationRequested(() => {
        abortController.abort();
      });

      try {
        const stream = await this.client.startChatStream(
          requestParams as unknown as Parameters<OpenAIAPIClient["startChatStream"]>[0],
          abortController.signal,
        );

        await this.streamProcessor.processStream(stream, progress, token);
        logger.info("[OpenAI Provider] Chat request completed");
      } finally {
        cancellationListener.dispose();
      }
    } catch (error) {
      logger.error("[OpenAI Provider] Chat request failed", {
        error: error instanceof Error ? { message: error.message, name: error.name } : String(error),
        modelId: model.id,
      });
      throw error;
    }
  }

  async provideTokenCount(
    _model: LanguageModelChatInformation,
    text: LanguageModelChatMessage | string,
    _token: CancellationToken,
  ): Promise<number> {
    // Simple estimation: ~4 characters per token
    // OpenAI does not have a dedicated token counting API endpoint.
    // For more accurate counts, tiktoken could be used as a dependency.
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

function formatTokenLimit(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
