import * as vscode from "vscode";

import { logger } from "../logger";

/**
 * Interactive settings management for the OpenAI for Copilot extension.
 * Much simpler than the Bedrock version: just API key, base URL, and organization.
 */
export async function manageSettings(secrets: vscode.SecretStorage): Promise<void> {
  const currentApiKey = await secrets.get("openai-for-copilot.apiKey");
  const config = vscode.workspace.getConfiguration("openai-for-copilot");

  const action = await vscode.window.showQuickPick(
    [
      {
        description: currentApiKey ? "Key is set" : "No key configured",
        label: "Set API Key",
        value: "api-key" as const,
      },
      {
        description: `Current: ${config.get<string>("baseUrl") ?? "default (api.openai.com)"}`,
        label: "Set Base URL",
        value: "base-url" as const,
      },
      {
        description: `Current: ${config.get<string>("organization") ?? "none"}`,
        label: "Set Organization",
        value: "organization" as const,
      },
      { label: "Clear Settings", value: "clear" as const },
    ],
    {
      placeHolder: "Choose an action",
      title: "Manage OpenAI for Copilot",
    },
  );

  if (!action) return;

  switch (action.value) {
    case "api-key": {
      await handleSetApiKey(secrets);
      break;
    }
    case "base-url": {
      await handleSetBaseUrl();
      break;
    }
    case "clear": {
      await handleClearSettings(secrets);
      break;
    }
    case "organization": {
      await handleSetOrganization();
      break;
    }
  }
}

async function handleSetApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    password: true,
    placeHolder: "sk-...",
    prompt: "Enter your OpenAI API key",
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "API key cannot be empty";
      }
      return undefined;
    },
  });

  if (apiKey) {
    await secrets.store("openai-for-copilot.apiKey", apiKey.trim());
    vscode.window.showInformationMessage("OpenAI API key saved successfully.");
    logger.info("[Settings] API key updated");
  }
}

async function handleSetBaseUrl(): Promise<void> {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");
  const currentUrl = config.get<string>("baseUrl");

  const baseUrl = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: "https://api.openai.com/v1",
    prompt: "Enter custom base URL (leave empty for default)",
    value: currentUrl ?? "",
  });

  if (baseUrl !== undefined) {
    const value = baseUrl.trim() || null;
    await config.update("baseUrl", value, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      value ? `Base URL set to ${value}` : "Base URL reset to default.",
    );
  }
}

async function handleSetOrganization(): Promise<void> {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");
  const currentOrg = config.get<string>("organization");

  const org = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: "org-...",
    prompt: "Enter OpenAI organization ID (leave empty to clear)",
    value: currentOrg ?? "",
  });

  if (org !== undefined) {
    const value = org.trim() || null;
    await config.update("organization", value, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      value ? `Organization set to ${value}` : "Organization cleared.",
    );
  }
}

async function handleClearSettings(secrets: vscode.SecretStorage): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "This will clear your API key and all settings. Continue?",
    { modal: true },
    "Clear All",
  );

  if (confirm === "Clear All") {
    await secrets.delete("openai-for-copilot.apiKey");
    const config = vscode.workspace.getConfiguration("openai-for-copilot");
    await config.update("baseUrl", undefined, vscode.ConfigurationTarget.Global);
    await config.update("organization", undefined, vscode.ConfigurationTarget.Global);
    await config.update("preferredModel", undefined, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage("All OpenAI for Copilot settings cleared.");
    logger.info("[Settings] All settings cleared");
  }
}
