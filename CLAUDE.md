# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VS Code extension that integrates OpenAI models (GPT-4o, GPT-4.1, GPT-5.x, o1, o3, o4-mini) into GitHub Copilot Chat using VS Code's `LanguageModelChatProvider` API. All requests go through the OpenAI Responses API (`/v1/responses`).

## Essential Commands

### Development

```bash
bun install                               # Install dependencies (also downloads VS Code API definitions)
bunx tsgo --noEmit                        # Run TypeScript type checking (no emit)
bunx eslint -f compact --fix FILENAME.ts  # Run ESLint
```

### Testing

Uses `mocha` via `vscode-test`

```bash
bun run test             # Run tests
```

## Architecture Overview

### Core Flow

1. **Extension activation** (extension.ts) -> Registers `OpenAIChatModelProvider` with VS Code
2. **Model listing** -> `OpenAIAPIClient` fetches models via `client.models.list()` and filters to Responses-capable IDs
3. **Chat requests** -> Messages -> Responses `input[]` + `instructions` -> `responses.create({ stream: true })`
4. **Stream processing** -> `StreamProcessor` handles `ResponseStreamEvent` union (output_text, function_call_arguments, reasoning_text, etc.)
5. **Stored conversations** -> `ConversationIndex` records `response.id` per session and threads `previous_response_id` on follow-up turns

### Key Components

**Provider Layer** (src/provider.ts)

- `OpenAIChatModelProvider`: Main VS Code integration implementing `LanguageModelChatProvider`
- `provideLanguageModelChatInformation()`: Lists available OpenAI models
- `provideLanguageModelChatResponse()`: Handles chat requests with streaming
- Token estimation using char_count/4 approximation

**OpenAI Integration** (src/openai-client.ts)

- `OpenAIAPIClient`: Wraps `openai` SDK client
- `fetchModels()`: Lists and filters Responses-capable chat models
- `startResponsesStream()`: Starts a streaming `responses.create` call

**Message Conversion** (src/converters/)

- `messages.ts`: VS Code messages -> Responses `input[]` plus a top-level `instructions` string
- `tools.ts`: VS Code tools -> Responses `FunctionTool` (flat shape, no nested `function:` wrapper)
- `schema.ts`: JSON Schema passthrough

**Stream Processing** (src/stream-processor.ts)

- Processes the `ResponseStreamEvent` union from `/v1/responses`
- `response.output_text.delta` -> Text parts
- `response.reasoning_text.delta` and `response.reasoning_summary_text.delta` -> Inline reasoning text (gated by `showReasoning`)
- `response.function_call_arguments.delta` -> Accumulated via `ToolBuffer` keyed by `item_id`
- `response.function_call_arguments.done` -> Finalized and emitted as `LanguageModelToolCallPart`
- Captures `response.id` from `response.completed` for `previous_response_id`

**Configuration** (src/commands/manage-settings.ts, src/settings.ts)

- API key stored in VS Code `SecretStorage`
- Settings: base URL, organization, preferred model, reasoning effort, `showReasoning`, `storeConversations`

**Logging** (src/logger.ts)

- Uses `LogOutputChannel` for structured logging
- Log levels: trace, debug, info, warn, error

### Model Capabilities (src/profiles.ts)

- **Reasoning models** (GPT-5.x, o1, o3, o4-mini): Support `reasoning.effort`, no `temperature`
- **GPT-4 models**: Support temperature, vision, tool calling
- **GPT-5 models**: Support reasoning effort, vision, tool calling; do not use temperature
- All requests use `max_output_tokens` (Responses API field; Chat Completions's `max_completion_tokens` does not apply)
- Token limits are hardcoded per known model family with conservative defaults for unknown models

## Configuration Files

- **package.json**: VS Code contribution point `languageModelChatProviders` with vendor `"openai-for-copilot"`
- **tsconfig.json**: Strict mode, ES2024 target, Node16 modules
- **eslint.config.mjs**: TypeScript ESLint + stylistic plugin

## VS Code API Requirements

- Minimum VS Code version: 1.116.0
- Uses proposed/experimental APIs (downloaded via `bun run download-api`)

## Development Workflow

1. Make code changes
2. Run `bun run check-types` and `bun run lint` before committing
