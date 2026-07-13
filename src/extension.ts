import * as vscode from "vscode";

import { manageSettings } from "./commands/manage-settings";
import { logger } from "./logger";
import { OpenAIChatModelProvider } from "./provider";
import { statusBar } from "./status-bar";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel(
    "OpenAI for Copilot",
    { log: true },
  );
  logger.initialize(outputChannel, context.extensionMode);

  logger.info(
    "OpenAI for Copilot extension activated. For verbose debugging, set log level to Debug via the output channel dropdown menu.",
  );

  // Proposed-API sanity check. registerLanguageModelChatProvider is a proposed
  // (unstable) VS Code API; a VS Code update can rename or remove it without a
  // deprecation cycle. Fail loudly with an actionable message instead of a
  // cryptic "x is not a function" deep in activation.
  if (typeof vscode.lm?.registerLanguageModelChatProvider !== "function") {
    const msg =
      "OpenAI for Copilot: this VS Code build does not expose " +
      "vscode.lm.registerLanguageModelChatProvider (a proposed API this extension " +
      `depends on). VS Code version: ${vscode.version}. The extension may need to be ` +
      "rebuilt against a newer proposed API. Models will not appear in the picker.";
    logger.error(msg);
    void vscode.window.showErrorMessage(msg);
    return;
  }

  const provider = new OpenAIChatModelProvider(context.secrets);

  // Status bar activity indicator (auto-hides when idle). Clicking it opens the
  // manage command for quick access to settings.
  statusBar.initialize({
    command: "openai-for-copilot.manage",
    enabled:
      vscode.workspace
        .getConfiguration("openai-for-copilot")
        .get<boolean>("showStatusBar") ?? true,
    label: "OpenAI",
  });

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
    if (e.affectsConfiguration("openai-for-copilot.showStatusBar")) {
      statusBar.setEnabled(
        vscode.workspace
          .getConfiguration("openai-for-copilot")
          .get<boolean>("showStatusBar") ?? true,
      );
    }
    if (
      e.affectsConfiguration("openai-for-copilot.baseUrl") ||
      e.affectsConfiguration("openai-for-copilot.organization") ||
      e.affectsConfiguration("openai-for-copilot.preferredModel") ||
      e.affectsConfiguration("openai-for-copilot.reasoningEffort") ||
      e.affectsConfiguration("openai-for-copilot.contextSafetyMargin") ||
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
    { dispose: () => statusBar.dispose() },
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
