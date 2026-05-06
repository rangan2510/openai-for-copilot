import * as vscode from "vscode";

import { manageSettings } from "./commands/manage-settings";
import { logger } from "./logger";
import { OpenAIChatModelProvider } from "./provider";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel(
    "OpenAI for Copilot",
    { log: true },
  );
  logger.initialize(outputChannel, context.extensionMode);

  logger.info(
    "OpenAI for Copilot extension activated. For verbose debugging, set log level to Debug via the output channel dropdown menu.",
  );

  const provider = new OpenAIChatModelProvider(context.secrets);

  const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
    "openai-for-copilot",
    provider,
  );

  const manageCmdDisposable = vscode.commands.registerCommand(
    "openai-for-copilot.manage",
    async () => {
      await manageSettings(context.secrets);
    },
  );

  // Refresh provider when relevant settings change
  const cfgDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("openai-for-copilot.baseUrl") ||
      e.affectsConfiguration("openai-for-copilot.organization") ||
      e.affectsConfiguration("openai-for-copilot.preferredModel") ||
      e.affectsConfiguration("openai-for-copilot.reasoningEffort") ||
      e.affectsConfiguration("openai-for-copilot.showReasoning") ||
      e.affectsConfiguration("openai-for-copilot.storeConversations")
    ) {
      provider.notifyModelInformationChanged("configuration changed");
    }
  });

  // Debounce secrets changes
  let secretsRefreshHandle: ReturnType<typeof setTimeout> | undefined;
  const secretsDisposable = context.secrets.onDidChange(() => {
    if (secretsRefreshHandle) {
      clearTimeout(secretsRefreshHandle);
    }
    secretsRefreshHandle = setTimeout(() => {
      provider.notifyModelInformationChanged("secrets changed (debounced)");
      secretsRefreshHandle = undefined;
    }, 400);
  });

  const secretsDebounceDisposable = new vscode.Disposable(() => {
    if (secretsRefreshHandle) {
      clearTimeout(secretsRefreshHandle);
      secretsRefreshHandle = undefined;
    }
  });

  // Respond to model selection changes after initial fetch
  let lmRefreshHandle: ReturnType<typeof setTimeout> | undefined;
  const lmDisposable = vscode.lm.onDidChangeChatModels(() => {
    if (!provider.isInitialFetchComplete()) {
      logger.debug(
        "[Extension] Ignoring onDidChangeChatModels before initial fetch complete",
      );
      return;
    }
    if (lmRefreshHandle) {
      clearTimeout(lmRefreshHandle);
    }
    lmRefreshHandle = setTimeout(() => {
      provider.notifyModelInformationChanged("selected chat models changed");
      lmRefreshHandle = undefined;
    }, 500);
  });

  const lmDebounceDisposable = new vscode.Disposable(() => {
    if (lmRefreshHandle) {
      clearTimeout(lmRefreshHandle);
      lmRefreshHandle = undefined;
    }
  });

  context.subscriptions.push(
    outputChannel,
    provider,
    providerDisposable,
    manageCmdDisposable,
    cfgDisposable,
    secretsDisposable,
    secretsDebounceDisposable,
    lmDisposable,
    lmDebounceDisposable,
  );
}

export function deactivate() {
  // Cleanup handled by disposables
}
