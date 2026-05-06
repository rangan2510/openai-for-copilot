import type { ResponseInputItem } from "openai/resources/responses/responses";

/**
 * Validate Responses API input items before sending to /v1/responses.
 *
 * The Responses API tolerates a wider variety of orderings than Chat
 * Completions (function_call_output items can appear anywhere), so we only
 * enforce a minimum-content guard here.
 */
export function validateInput(
  input: ResponseInputItem[],
  instructions: string | undefined,
): void {
  if (input.length === 0 && !instructions) {
    throw new Error("Input cannot be empty");
  }
}
