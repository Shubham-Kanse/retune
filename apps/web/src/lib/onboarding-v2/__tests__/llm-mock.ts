// Shared queue used by tests that mock @/lib/onboarding-v2/llm/calls.
// Each test file does its own vi.mock(...) at the top — Vitest hoists those —
// and references this queue from inside the mock factory.

const queue: Array<string | Error> = [];

export function mockCallLLM(responses: Array<string | Error>): void {
  queue.length = 0;
  queue.push(...responses);
}

export function clearLLMMocks(): void {
  queue.length = 0;
}

export function callsRemaining(): number {
  return queue.length;
}

export function nextLLMResponse(): {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
} {
  const next = queue.shift();
  if (next === undefined) throw new Error("[mock] callLLM queue exhausted");
  if (next instanceof Error) throw next;
  return { content: next, inputTokens: 100, outputTokens: 200, costUsd: 0.001 };
}
