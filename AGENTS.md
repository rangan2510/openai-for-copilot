# Repository Guidelines

## Project Overview

A VS Code extension that integrates OpenAI models (GPT-4o, GPT-4.1, GPT-5.2, o3, o4-mini) into GitHub Copilot Chat using VS Code's `LanguageModelChatProvider` API. Auth is via OpenAI API key.

Derived from the architecture of [amazon-bedrock-copilot-chat](https://github.com/tinovyatkin/amazon-bedrock-copilot-chat), adapted for the OpenAI Responses API (`/v1/responses`).

## Project Structure and Module Organization

- Source: `src/` (extension entry `extension.ts`, provider `provider.ts`, OpenAI client `openai-client.ts`, converters under `converters/`, commands under `commands/`).
- Build output: `dist/` (bundled extension); VSIX goes to `dist/extension.vsix`.
- Architecture: `extension.ts` activates -> `provider.ts` lists models and streams replies -> `converters/` adapt messages/tools -> `stream-processor.ts` handles SSE chunks -> `logger.ts` records logs.

## Build, Test, and Development Commands

- `bun install` -- install deps and VS Code API d.ts via postinstall.
- `bun run compile` -- build the extension to `dist/extension.js` (CJS, sourcemaps).
- `bun run package` -- same as compile; used by `vscode:prepublish`.
- `bun run vsce:package` -- create `dist/extension.vsix` for manual install.
- `bun run check-types` -- type-check with `tsgo` (no emit).
- `bun run lint` / `bun run format` / `bun run format:check` -- ESLint + Prettier.
- `bun run test` -- runs `vscode-test` (pretest runs type-check).
- `bun run download-api` -- refresh proposed VS Code API d.ts when upgrading VS Code.
- Dev loop: open in VS Code >= 1.116.0, press `F5` to launch Extension Development Host; check `OpenAI for Copilot` output channel.

## Coding Style and Naming Conventions

- 2-space indentation, LF endings (`.editorconfig`). Prettier enforces 100-char width.
- TypeScript; prefer type-only imports and `readonly` fields; avoid `console` (use `logger`).
- Keep imports logically grouped; follow existing provider abstractions (client -> provider -> stream processor).

## Testing Guidelines

- Unit/integration tests live in `src/test/*.test.ts`; name new specs `<feature>.test.ts`.
- For tests that hit OpenAI API, guard with environment checks to avoid accidental spend; prefer mocked clients where possible.
- Run `bun run test` before PRs.

## Extension Identity

| Identifier type    | Value                       | Location                                                               |
| ------------------ | --------------------------- | ---------------------------------------------------------------------- |
| Extension name     | `openai-for-copilot`        | `package.json` `name`                                                  |
| Publisher          | `rangan2510`                | `package.json` `publisher`                                             |
| Vendor             | `openai-for-copilot`        | `package.json` `contributes.languageModelChatProviders[0].vendor`      |
| Display name       | `OpenAI for Copilot`        | `package.json` `contributes.languageModelChatProviders[0].displayName` |
| Management command | `openai-for-copilot.manage` | `package.json` `contributes` + `extension.ts`                          |
| Config namespace   | `openai-for-copilot.*`      | `package.json` `contributes.configuration.properties` + `settings.ts`  |

## Key Differences from Bedrock Version

- **Auth**: API key only (stored in `SecretStorage`). No AWS profiles/credentials/regions.
- **SDK**: Single `openai` npm package. No AWS SDK.
- **API**: OpenAI Responses API (`/v1/responses`) with SSE streaming. Chat Completions is not used.
- **Models**: Discovered via `client.models.list()`. No inference profiles.
- **Thinking**: GPT-5.x and o-series models use `reasoning.effort`; unsupported effort values are ignored per model. Reasoning text streams inline by default (toggle via `showReasoning`).
- **Prompt caching**: Handled server-side by OpenAI. With `storeConversations` on, the provider also threads `previous_response_id` so follow-up turns skip resending earlier messages.
- **Token counting**: Estimation via char/4 heuristic. No dedicated API endpoint.

## File Organization

```text
src/
  extension.ts              # Entry point, activation
  provider.ts               # Main LanguageModelChatProvider (Responses transport)
  openai-client.ts          # OpenAI SDK wrapper around responses.create
  stream-processor.ts       # Handles /v1/responses streaming events
  tool-buffer.ts            # JSON accumulator for streaming tool calls (keyed by item_id)
  conversation-index.ts     # Tracks previous_response_id per session
  profiles.ts               # Model capability profiles and token limits
  settings.ts               # Configuration reader
  logger.ts                 # Centralized logging
  validation.ts             # Responses input validation
  types.ts                  # TypeScript interfaces
  commands/
    manage-settings.ts      # Settings UI (API key, base URL, org, reasoning, toggles)
  converters/
    messages.ts             # VSCode messages -> Responses input[] + instructions
    tools.ts                # VSCode tools -> Responses FunctionTool
    schema.ts               # JSON Schema passthrough
```
