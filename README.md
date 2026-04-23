# OpenAI for Copilot

Bring your own OpenAI API key to VS Code and use any OpenAI chat model inside Copilot Chat -- no Copilot Pro+ required, no premium request limits, no admin gating.

This extension registers as a VS Code `LanguageModelChatProvider`, so models from your OpenAI account show up directly in the Copilot Chat model picker alongside the built-in options. You get the same native chat experience (agent mode, tool calling, inline edits) backed by whichever OpenAI model you choose to pay for.

## Why use this instead of Copilot's built-in OpenAI models?

GitHub Copilot already offers a handful of OpenAI models. But the built-in integration has real limitations:

| | Built-in Copilot | This extension |
|---|---|---|
| **Pricing** | Premium request multipliers (GPT-5.4 costs 3x per request) | Pay-per-token via your OpenAI API key |
| **Model access** | Curated subset; GPT-5.4 requires Pro+ | Every chat model on your OpenAI account |
| **Retired models** | o3, o3-mini, o4-mini, GPT-5, GPT-5.1 removed | Still available if OpenAI serves them |
| **Older models** | GPT-4o, GPT-4.1, GPT-4-turbo dropped | Still usable for cost-sensitive tasks |
| **Nano/mini variants** | Limited availability | GPT-5-nano, GPT-5.4-nano, GPT-4.1-nano, etc. |
| **Codex** | Separate Codex models and subscription tier | Not needed; use chat models directly |
| **Rate limits** | Monthly premium request quota | Standard OpenAI API rate limits |
| **Admin control** | Enterprise/Business admins gate model access | Your API key, your models |
| **Custom endpoints** | No | Azure OpenAI, proxies, self-hosted |
| **Model discovery** | Static list, updated by GitHub | Auto-discovered from your OpenAI account |

In short: if a model exists on your OpenAI account and supports chat completions, it shows up here. No waiting for GitHub to add it, no plan upgrade to unlock it, no multiplier eating your quota.

## What it supports

- **Streaming** -- responses stream into the chat UI token by token
- **Tool calling** -- full support for Copilot's tool/function calling protocol with streaming argument accumulation
- **Vision** -- send images to multimodal models (GPT-4o, GPT-4.1, GPT-5 family)
- **Reasoning models** -- o1, o3, o3-mini, o4-mini with configurable reasoning effort (high/medium/low)
- **Agent mode** -- works with VS Code's agent mode, inline edits, and ask mode
- **Auto-discovery** -- queries `models.list()` on your OpenAI account and filters to chat-capable models
- **Custom base URL** -- point at Azure OpenAI, a corporate proxy, or any OpenAI-compatible endpoint

## Available model families

The extension auto-discovers models from your account. Known families with tuned token limits:

| Family | Context | Max output | Notes |
|---|---|---|---|
| GPT-4-turbo | 128K | 4K | Older, cheap |
| GPT-4o / 4o-mini | 128K | 16K | Vision, fast |
| GPT-4.1 / mini / nano | 1M | 32K | 1M context window |
| GPT-5 / mini / nano | 1M | 16-64K | Current generation |
| GPT-5.1 through 5.4 | 1M | 32-64K | Latest; 5.4 available without Pro+ |
| o1, o3, o3-mini, o4-mini | 200K | 100K | Reasoning models |

Models not in the known list still work -- they get conservative defaults (128K input / 4K output). As OpenAI releases new models, they appear automatically.

## Requirements

- VS Code 1.116.0 or newer
- GitHub Copilot Chat extension installed
- An OpenAI API key ([platform.openai.com](https://platform.openai.com/api-keys))

## Getting started

1. Install the extension
2. Run **Manage OpenAI for Copilot** from the command palette (`Ctrl+Shift+P`)
3. Enter your OpenAI API key
4. Open Copilot Chat and pick any `OpenAI for Copilot` model from the model selector

Optional: set a preferred model, custom base URL, or organization ID in the same management command.

## Settings

| Setting | Description |
|---|---|
| `openai-for-copilot.baseUrl` | Custom API base URL (Azure OpenAI, proxy, etc.) |
| `openai-for-copilot.organization` | OpenAI organization ID (only needed for multi-org keys) |
| `openai-for-copilot.preferredModel` | Default model ID (e.g. `gpt-5.4`) |
| `openai-for-copilot.reasoningEffort` | Reasoning depth for o-series models: `high`, `medium`, `low` |

## How it works

The extension uses VS Code's `LanguageModelChatProvider` API -- the same interface that powers Copilot's own model integrations. When you pick an OpenAI model in the chat picker:

1. Your messages get converted from VS Code's format to OpenAI's Chat Completions API format
2. The request streams via the `openai` npm package to the API
3. SSE chunks get parsed back into VS Code's response format (text parts and tool calls)
4. Tool call arguments accumulate across chunks and emit when `finish_reason` signals completion

The extension handles the quirks: `max_completion_tokens` vs `max_tokens` for newer models, stripping `temperature` from reasoning models, injecting `reasoning_effort`, and ensuring object schemas always have a `properties` field (an OpenAI requirement that VS Code doesn't enforce).

## Development

```bash
bun install
bun run compile
bun run check-types
bun run lint
bun run test
```

Press F5 in VS Code to launch the Extension Development Host. Check the **OpenAI for Copilot** output channel for logs.

```bash
bun run vsce:package    # produces dist/extension.vsix
```

## License

MIT. See [LICENSE](LICENSE).
