import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Validate converted OpenAI messages before sending to the API.
 *
 * OpenAI is less strict than Bedrock about message ordering, but we still
 * enforce basic sanity checks.
 */
export function validateMessages(messages: ChatCompletionMessageParam[]): void {
  if (messages.length === 0) {
    throw new Error("Messages array cannot be empty");
  }
}
