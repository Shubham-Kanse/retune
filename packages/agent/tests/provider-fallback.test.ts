import assert from "node:assert/strict";
import test from "node:test";
import type { AIProvider, AIResponse, ProviderCapabilities } from "../src/lib/ai-provider";
import { _isFallbackableForTests, withFallback } from "../src/lib/provider-fallback";

const CAPS: ProviderCapabilities = {
  structuredOutput: true,
  reasoningEffort: false,
  webSearch: false,
  fileSearch: false,
  backgroundRuns: false,
  promptCaching: false,
};

function makeProvider(label: string, behaviour: () => Promise<AIResponse>): AIProvider {
  return {
    capabilities: CAPS,
    createMessage: () => behaviour(),
    createMessageWithTool: async () => label as unknown,
    createStructuredOutput: async () => label as unknown,
    createReasonedOutput: async () => label as unknown,
    searchWeb: async () => null,
    searchFiles: async () => null,
    runBackground: async () => null,
    drainModelCallTelemetry: () => [],
  } as unknown as AIProvider;
}

const okResponse: AIResponse = {
  content: [{ type: "text", text: "primary" }],
  stopReason: "end_turn",
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  model: "test",
  providerResponseId: "id",
};

test("isFallbackable: 429 + 5xx + 529 + overloaded_error are retried", () => {
  assert.equal(_isFallbackableForTests({ status: 429 }), true);
  assert.equal(_isFallbackableForTests({ status: 502 }), true);
  assert.equal(_isFallbackableForTests({ status: 503 }), true);
  assert.equal(_isFallbackableForTests({ status: 504 }), true);
  assert.equal(_isFallbackableForTests({ status: 529 }), true);
  assert.equal(_isFallbackableForTests({ type: "overloaded_error" }), true);
  assert.equal(_isFallbackableForTests({ message: "fetch failed" }), true);
  assert.equal(_isFallbackableForTests({ message: "ECONNRESET" }), true);
});

test("isFallbackable: 4xx (auth/validation) is NOT retried", () => {
  assert.equal(_isFallbackableForTests({ status: 400 }), false);
  assert.equal(_isFallbackableForTests({ status: 401 }), false);
  assert.equal(_isFallbackableForTests({ status: 403 }), false);
  assert.equal(_isFallbackableForTests({ status: 404 }), false);
});

test("withFallback: primary success returns primary's response", async () => {
  const primary = makeProvider("primary", async () => okResponse);
  const secondary = makeProvider("secondary", async () => ({ ...okResponse, model: "secondary" }));
  const wrapped = withFallback(primary, secondary);
  const r = await wrapped.createMessage("agent", { model: "x", maxTokens: 1, messages: [] });
  assert.equal(r.model, "test");
});

test("withFallback: primary 529 overload triggers fallback", async () => {
  const primary = makeProvider("primary", async () => {
    const err = new Error("overloaded") as Error & { status?: number };
    err.status = 529;
    throw err;
  });
  const secondary = makeProvider("secondary", async () => ({ ...okResponse, model: "secondary" }));
  const wrapped = withFallback(primary, secondary);
  const r = await wrapped.createMessage("agent", { model: "x", maxTokens: 1, messages: [] });
  assert.equal(r.model, "secondary");
});

test("withFallback: primary 400 (validation) does NOT trigger fallback", async () => {
  const primary = makeProvider("primary", async () => {
    const err = new Error("invalid prompt") as Error & { status?: number };
    err.status = 400;
    throw err;
  });
  const secondary = makeProvider("secondary", async () => ({ ...okResponse, model: "secondary" }));
  const wrapped = withFallback(primary, secondary);
  await assert.rejects(
    () => wrapped.createMessage("agent", { model: "x", maxTokens: 1, messages: [] }),
    /invalid prompt/,
  );
});

test("withFallback: capabilities are inherited from primary", () => {
  const primary = makeProvider("primary", async () => okResponse);
  const secondary = makeProvider("secondary", async () => okResponse);
  const wrapped = withFallback(primary, secondary);
  assert.equal(wrapped.capabilities, CAPS);
});
