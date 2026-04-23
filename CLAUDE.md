# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VS Code extension that integrates OpenAI models (GPT-4o, GPT-4.1, GPT-5.2, o3, o4-mini) into GitHub Copilot Chat using VS Code's `LanguageModelChatProvider` API. Uses the `openai` npm package for API calls.

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
2. **Model listing** -> `OpenAIAPIClient` fetches available models via `client.models.list()`
3. **Chat requests** -> Messages converted to OpenAI format -> Streamed via `chat.completions.create({ stream: true })`
4. **Stream processing** -> `StreamProcessor` handles `ChatCompletionChunk` events

### Key Components

**Provider Layer** (src/provider.ts)

- `OpenAIChatModelProvider`: Main VS Code integration implementing `LanguageModelChatProvider`
- `provideLanguageModelChatInformation()`: Lists available OpenAI models
- `provideLanguageModelChatResponse()`: Handles chat requests with streaming
- Token estimation using char_count/4 approximation

**OpenAI Integration** (src/openai-client.ts)

- `OpenAIAPIClient`: Wraps `openai` SDK client
- `fetchModels()`: Lists and filters chat-capable models
- `startChatStream()`: Starts a streaming chat completion

**Message Conversion** (src/converters/)

- `messages.ts`: VS Code messages -> OpenAI `ChatCompletionMessageParam[]`
- `tools.ts`: VS Code tools -> OpenAI `ChatCompletionTool[]`
- `schema.ts`: JSON Schema passthrough (both APIs use JSON Schema)

**Stream Processing** (src/stream-processor.ts)

- Processes OpenAI `ChatCompletionChunk` SSE events
- `delta.content` -> Text parts
- `delta.tool_calls` -> Accumulated via ToolBuffer, emitted on `finish_reason: "tool_calls"`

**Configuration** (src/commands/manage-settings.ts, src/settings.ts)

- API key stored in VS Code `SecretStorage`
- Settings: base URL, organization, preferred model, reasoning effort

**Logging** (src/logger.ts)

- Uses `LogOutputChannel` for structured logging
- Log levels: trace, debug, info, warn, error

### Model Capabilities (src/profiles.ts)

- **Reasoning models** (o3, o4-mini): Support `reasoning_effort`, no `temperature`
- **GPT models**: Support temperature, vision, tool calling
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
