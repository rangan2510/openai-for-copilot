<p align="center">
  <img src="assets/logo.png" alt="OpenAI for Copilot" width="128" />
</p>

<h1 align="center">OpenAI for Copilot</h1>

<p align="center">
  <a href="https://github.com/rangan2510/openai-for-copilot/releases/latest"><img src="https://img.shields.io/github/v/release/rangan2510/openai-for-copilot?label=version" alt="Latest release" /></a>
  <a href="https://github.com/rangan2510/openai-for-copilot/releases/latest"><img src="https://img.shields.io/github/downloads/rangan2510/openai-for-copilot/total" alt="Downloads" /></a>
  <a href="https://github.com/rangan2510/openai-for-copilot/blob/main/LICENSE.txt"><img src="https://img.shields.io/github/license/rangan2510/openai-for-copilot" alt="License" /></a>
  <img src="https://img.shields.io/badge/VS%20Code-%3E%3D1.116.0-blue" alt="VS Code version" />
</p>

### v0.1.1

- Added GPT-5.x reasoning effort support, including `none`, `minimal`, and `xhigh`
- Preserves model defaults unless reasoning effort is explicitly configured
- Updated GPT-5.x context and output token limits from OpenAI docs

### v0.1.0

- Initial release with auto-discovery of all chat-capable OpenAI models
- GPT-4o, GPT-4.1, GPT-4-turbo, GPT-5 through GPT-5.5, o1, o3, o4-mini
- Streaming, tool calling, vision, reasoning effort control
- `max_completion_tokens` handling for GPT-5+ and o-series models
- Empty schema fix for OpenAI's strict function parameter validation

---

Bring your own OpenAI API key to VS Code and use any OpenAI chat model inside Copilot Chat -- no Copilot Pro+ required, no premium request limits, no admin gating.

This extension registers as a VS Code `LanguageModelChatProvider`, so models from your OpenAI account show up directly in the Copilot Chat model picker alongside the built-in options. You get the same native chat experience (agent mode, tool calling, inline edits) backed by whichever OpenAI model you choose to pay for.

## A note on Copilot's upcoming billing changes

GitHub paused new Pro/Pro+/Student sign-ups, tightened weekly token-based usage limits, and pulled some models from Pro plans on April 20, 2026 ([GitHub blog](https://github.blog/news-insights/company-news/changes-to-github-copilot-individual-plans/)). Reporting from [Where's Your Ed At](https://www.wheresyoured.at/exclusive-microsoft-moving-all-github-copilot-subscribers-to-token-based-billing-in-june/) and a [link post by Simon Willison](https://simonwillison.net/2026/Apr/22/changes-to-github-copilot/) indicate a broader shift to token-based consumption billing rolling out from June.

This extension sidesteps the moving target. Your OpenAI API key, OpenAI's published per-token rates, no Microsoft markup, no premium-request multipliers, no weekly cap on agent runs. Use it as a drop-in inside Copilot Chat alongside whichever Copilot plan you keep.

## Why use this instead of Copilot's built-in OpenAI models?

GitHub Copilot already offers a handful of OpenAI models. The built-in integration is fine for casual use, but it has constraints this extension sidesteps:

|                                 | Built-in Copilot                                                                                                                                                              | This extension                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Pricing**                     | Subscription + premium-request quotas; token-based billing rolling out from June 2026                                                                                         | Pay-per-token directly to OpenAI at [their published rates](https://platform.openai.com/docs/pricing) |
| **Premium-request multipliers** | Latest models cost up to 7.5x per request (e.g. GPT-5.5 = 7.5x) ([source](https://docs.github.com/en/copilot/reference/ai-models/supported-models))                           | None -- you pay actual tokens used                                                                    |
| **Weekly usage caps**           | Token-based weekly limits on Pro/Pro+/Student plans ([source](https://github.blog/news-insights/company-news/changes-to-github-copilot-individual-plans/))                    | Standard OpenAI API rate limits (your account tier)                                                   |
| **Plan gating**                 | Newer OpenAI models gated behind Pro+/Business/Enterprise (e.g. GPT-5.5); Business/Enterprise admins can disable models                                                       | Your key, every chat-capable model on your account                                                    |
| **Model availability**          | Curated list; older models (o3, o4-mini, GPT-5/5.1, GPT-4-turbo) removed; GPT-4o restricted to Free tier                                                                      | Anything OpenAI still serves on your account, including legacy models                                 |
| **Sign-ups**                    | New Pro/Pro+/Student sign-ups paused as of April 2026 ([source](https://github.blog/news-insights/company-news/changes-to-github-copilot-individual-plans/))                  | Works on Copilot Free; only requires the Copilot Chat extension                                       |
| **Model discovery**             | Static list, updated by GitHub                                                                                                                                                | Auto-discovered via `models.list()` on your account                                                   |
| **Custom endpoints**            | Copilot BYOK supports a few providers but not for Business/Enterprise ([docs](https://docs.github.com/en/copilot/how-tos/configure-personal-settings/use-bring-your-own-key)) | Any OpenAI-compatible endpoint (Azure OpenAI, proxies, self-hosted)                                   |

In short: if a model exists on your OpenAI account and supports chat completions, it shows up here -- no plan upgrade to unlock it, no multiplier eating your quota, no weekly token cap.

## What it supports

- **Streaming** -- responses stream into the chat UI token by token
- **Tool calling** -- full support for Copilot's tool/function calling protocol with streaming argument accumulation
- **Vision** -- send images to multimodal models (GPT-4o, GPT-4.1, GPT-5 family)
- **Reasoning models** -- GPT-5.x plus o1, o3, o3-mini, o4-mini with configurable reasoning effort
- **Agent mode** -- works with VS Code's agent mode, inline edits, and ask mode
- **Auto-discovery** -- queries `models.list()` on your OpenAI account and filters to chat-capable models
- **Custom base URL** -- point at Azure OpenAI, a corporate proxy, or any OpenAI-compatible endpoint

## Available model families

The extension auto-discovers models from your account. Known families with tuned token limits:

| Family                   | Context | Max output | Notes                                                           |
| ------------------------ | ------- | ---------- | --------------------------------------------------------------- |
| GPT-4-turbo              | 128K    | 4K         | Older, cheap                                                    |
| GPT-4o / 4o-mini         | 128K    | 16K        | Vision, fast                                                    |
| GPT-4.1 / mini / nano    | 1M      | 32K        | 1M context window                                               |
| GPT-5 / mini / nano      | 400K    | 128K       | Supports `minimal`, `low`, `medium`, `high` reasoning           |
| GPT-5.1                  | 400K    | 128K       | Supports `none`, `low`, `medium`, `high` reasoning              |
| GPT-5.2                  | 400K    | 128K       | Supports `none`, `low`, `medium`, `high`, `xhigh` reasoning     |
| GPT-5.4 / 5.5            | 1.05M   | 128K       | Latest long-context GPT-5.x models; GPT-5.5 released April 2026 |
| o1, o3, o3-mini, o4-mini | 200K    | 100K       | Reasoning models                                                |

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

| Setting                              | Description                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `openai-for-copilot.baseUrl`         | Custom API base URL (Azure OpenAI, proxy, etc.)                                                                       |
| `openai-for-copilot.organization`    | OpenAI organization ID (only needed for multi-org keys)                                                               |
| `openai-for-copilot.preferredModel`  | Default model ID (e.g. `gpt-5.4`)                                                                                     |
| `openai-for-copilot.reasoningEffort` | Reasoning depth for GPT-5.x and o-series models: `model-default`, `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |

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
