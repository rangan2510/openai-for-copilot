import * as vscode from "vscode";

import { logger } from "../logger";

/** VS Code language model vendor id for this extension's provider. */
const OPENAI_VENDOR = "openai-for-copilot";

/**
 * Interactive settings management for the OpenAI for Copilot extension.
 */
export async function manageSettings(
  secrets: vscode.SecretStorage,
): Promise<void> {
  const currentApiKey = await secrets.get("openai-for-copilot.apiKey");
  const config = vscode.workspace.getConfiguration("openai-for-copilot");
  const chatConfig = vscode.workspace.getConfiguration("chat");

  const action = await vscode.window.showQuickPick(
    [
      {
        description: currentApiKey ? "Key is set" : "No key configured",
        label: "Set API Key",
        value: "api-key" as const,
      },
      {
        description: `Current: ${
          config.get<string>("baseUrl") ?? "default (api.openai.com)"
        }`,
        label: "Set Base URL",
        value: "base-url" as const,
      },
      {
        description: `Current: ${config.get<string>("organization") ?? "none"}`,
        label: "Set Organization",
        value: "organization" as const,
      },
      {
        description: `Current: ${chatConfig.get<string>("utilitySmallModel") ?? "Default"}`,
        label: "Set Utility Model",
        value: "utility-model" as const,
      },
      {
        description: `Current: ${chatConfig.get<string>("byokUtilityModelDefault") ?? "none"}`,
        label: "Set BYOK Utility Default",
        value: "byok-utility-default" as const,
      },
      {
        description: `Current: ${
          config.get<string>("reasoningEffort") ?? "model-default"
        }`,
        label: "Set Reasoning Effort",
        value: "reasoning-effort" as const,
      },
      {
        description: `Current: ${
          (config.get<boolean>("showReasoning") ?? true) ? "on" : "off"
        }`,
        label: "Toggle Show Reasoning",
        value: "toggle-show-reasoning" as const,
      },
      {
        description: `Current: ${
          (config.get<boolean>("storeConversations") ?? true) ? "on" : "off"
        }`,
        label: "Toggle Store Conversations",
        value: "toggle-store" as const,
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
    case "reasoning-effort": {
      await handleSetReasoningEffort();
      break;
    }
    case "utility-model": {
      await handleSetUtilityModel();
      break;
    }
    case "byok-utility-default": {
      await handleSetByokUtilityDefault();
      break;
    }
    case "toggle-show-reasoning": {
      await handleToggle("showReasoning", "Show reasoning");
      break;
    }
    case "toggle-store": {
      await handleToggle("storeConversations", "Store conversations");
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
    await config.update(
      "organization",
      value,
      vscode.ConfigurationTarget.Global,
    );
    vscode.window.showInformationMessage(
      value ? `Organization set to ${value}` : "Organization cleared.",
    );
  }
}

async function handleSetReasoningEffort(): Promise<void> {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");
  const currentEffort =
    config.get<string>("reasoningEffort") ?? "model-default";

  const effort = await vscode.window.showQuickPick(
    [
      { description: "Use each model's API default", label: "model-default" },
      { description: "No reasoning where supported", label: "none" },
      { description: "Minimal reasoning for GPT-5", label: "minimal" },
      { description: "Low reasoning effort", label: "low" },
      { description: "Medium reasoning effort", label: "medium" },
      { description: "High reasoning effort", label: "high" },
      {
        description: "Extra-high reasoning for GPT-5.2+ where supported",
        label: "xhigh",
      },
    ],
    {
      placeHolder: `Current: ${currentEffort}`,
      title: "Set Reasoning Effort",
    },
  );

  if (effort) {
    await config.update(
      "reasoningEffort",
      effort.label,
      vscode.ConfigurationTarget.Global,
    );
    vscode.window.showInformationMessage(
      `Reasoning effort set to ${effort.label}.`,
    );
  }
}

/**
 * Let the user pick a specific model to back VS Code's utility flows
 * (chat.utilityModel / chat.utilitySmallModel). Selecting an explicit model
 * also sets chat.byokUtilityModelDefault to "none" so the explicit choice wins.
 */
async function handleSetUtilityModel(): Promise<void> {
  const chatConfig = vscode.workspace.getConfiguration("chat");
  const currentSelector = chatConfig.get<string>("utilitySmallModel") ?? "Default";
  const models = await vscode.lm.selectChatModels({ vendor: OPENAI_VENDOR });
  const availableModels = models.toSorted((a, b) => a.name.localeCompare(b.name));

  if (availableModels.length === 0) {
    vscode.window.showWarningMessage(
      "No available OpenAI models found for this provider. Configure API key and retry.",
    );
    return;
  }

  const selected = await vscode.window.showQuickPick(
    availableModels.map((model) => ({
      description: model.id,
      label: model.name,
      selectorLabel: formatUtilityModelSelector(model.name, OPENAI_VENDOR),
      value: model.id,
    })),
    {
      ignoreFocusOut: true,
      placeHolder: `Current: ${currentSelector}`,
      title: "Select Utility Model",
    },
  );

  if (!selected) return;

  await chatConfig.update("byokUtilityModelDefault", "none", vscode.ConfigurationTarget.Global);
  await chatConfig.update(
    "utilityModel",
    selected.selectorLabel,
    vscode.ConfigurationTarget.Global,
  );
  await chatConfig.update(
    "utilitySmallModel",
    selected.selectorLabel,
    vscode.ConfigurationTarget.Global,
  );
  vscode.window.showInformationMessage(`Utility model set to ${selected.value}.`);
}

async function handleSetByokUtilityDefault(): Promise<void> {
  const config = vscode.workspace.getConfiguration("chat");
  const currentValue = config.get<string>("byokUtilityModelDefault") ?? "none";

  const selected = await vscode.window.showQuickPick(
    [
      {
        description: "Recommended when switching between BYOK providers. Reuses the currently selected main chat model.",
        label: "Use Main Agent Model",
        value: "mainAgent",
      },
      {
        description: "Use GitHub Copilot utility models for background utility flows.",
        label: "Use Copilot Utility Models",
        value: "copilot",
      },
      {
        description: "Require an explicit chat.utilityModel/chat.utilitySmallModel override.",
        label: "No Default Utility Model",
        value: "none",
      },
    ],
    {
      ignoreFocusOut: true,
      placeHolder: `Current: ${currentValue}`,
      title: "Select BYOK Utility Default",
    },
  );

  if (!selected) return;

  await config.update(
    "byokUtilityModelDefault",
    selected.value,
    vscode.ConfigurationTarget.Global,
  );
  if (selected.value === "mainAgent" || selected.value === "copilot") {
    await config.update("utilityModel", undefined, vscode.ConfigurationTarget.Global);
    await config.update("utilitySmallModel", undefined, vscode.ConfigurationTarget.Global);
  }

  vscode.window.showInformationMessage(`BYOK utility default set to ${selected.value}.`);
}

function formatUtilityModelSelector(name: string, vendor: string): string {
  return `${name} (${vendor})`;
}

async function handleToggle(
  configKey: "showReasoning" | "storeConversations",
  displayName: string,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("openai-for-copilot");
  const current = config.get<boolean>(configKey) ?? true;
  const next = !current;
  await config.update(configKey, next, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(
    `${displayName} is now ${next ? "on" : "off"}.`,
  );
}

async function handleClearSettings(
  secrets: vscode.SecretStorage,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "This will clear your API key and all settings. Continue?",
    { modal: true },
    "Clear All",
  );

  if (confirm === "Clear All") {
    await secrets.delete("openai-for-copilot.apiKey");
    const config = vscode.workspace.getConfiguration("openai-for-copilot");
    await config.update(
      "baseUrl",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "organization",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "preferredModel",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "reasoningEffort",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "showReasoning",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      "storeConversations",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    vscode.window.showInformationMessage(
      "All OpenAI for Copilot settings cleared.",
    );
    logger.info("[Settings] All settings cleared");
  }
}
