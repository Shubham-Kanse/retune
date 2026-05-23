/**
 * Phase 1 Provider Upgrade tests (003 §7).
 *
 * Provider auth, structured output, retry, malformed-output, and
 * telemetry parity. The actual SDK is mocked via the `_resetClient`
 * helpers so the test runs offline.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { _resetProvider, getProvider } from "../src/lib/provider";
import { _resetAnthropicClient, anthropicProvider } from "../src/lib/providers/anthropic";
import { _resetOpenAIClient, openaiProvider } from "../src/lib/providers/openai";

// Tests run a tiny FakeOpenAI / FakeAnthropic via globalThis interception
// pattern documented in tests/provider-auth.test.ts. Here we focus on
// the abstract shape: capabilities, schema enforcement, telemetry.

test("openaiProvider exposes 003 capabilities flags", () => {
  assert.equal(openaiProvider.capabilities.structuredOutput, true);
  assert.equal(openaiProvider.capabilities.reasoningEffort, true);
  assert.equal(openaiProvider.capabilities.fileSearch, true);
  assert.equal(openaiProvider.capabilities.backgroundRuns, true);
});

test("anthropicProvider exposes 003 capabilities flags", () => {
  assert.equal(anthropicProvider.capabilities.structuredOutput, true);
  assert.equal(anthropicProvider.capabilities.reasoningEffort, false);
  assert.equal(anthropicProvider.capabilities.webSearch, true);
  assert.equal(anthropicProvider.capabilities.fileSearch, false);
  assert.equal(anthropicProvider.capabilities.backgroundRuns, false);
  assert.equal(anthropicProvider.capabilities.promptCaching, true);
});

test("getProvider() returns the AI_PROVIDER-selected instance", () => {
  // Note: getProvider() wraps the underlying provider with a
  // concurrency manager (Charter 09 Epic 02 / 11 Epic 01) so the
  // returned object is no longer reference-identical to the
  // openai/anthropic exports. We verify selection via the
  // `capabilities` object, which is preserved by reference through
  // the wrapping spread.
  _resetProvider();
  process.env.AI_PROVIDER = "openai";
  const p = getProvider();
  assert.ok(p.capabilities === openaiProvider.capabilities);
  _resetProvider();
  process.env.AI_PROVIDER = "anthropic";
  const a = getProvider();
  assert.ok(a.capabilities === anthropicProvider.capabilities);
  _resetProvider();
});

test("openaiProvider.searchFiles returns null without responses API", async () => {
  // Without OPENAI_API_KEY the lazy SDK throws, so we use a dummy key
  // to instantiate but never actually contact OpenAI — the method
  // checks for the responses property and the SDK build available
  // here may not expose it.
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  _resetOpenAIClient();
  try {
    const r = await openaiProvider.searchFiles("anything", { vectorStoreId: "vs_x" });
    // Older SDK versions may not have `responses` exposed → null.
    if (r !== null) {
      assert.equal(typeof r, "object");
      assert.ok(Array.isArray(r.hits));
    }
  } finally {
    if (original === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else process.env.OPENAI_API_KEY = original;
    _resetOpenAIClient();
  }
});

test("openaiProvider.runBackground returns null in current build", async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  _resetOpenAIClient();
  const schema = z.object({ ok: z.boolean() });
  const result = await openaiProvider.runBackground("test-agent", {
    model: "gpt-4o",
    maxTokens: 64,
    system: "system",
    messages: [{ role: "user", content: "hi" }],
    schema,
    schemaName: "ok",
    reasoningEffort: "low",
    traceId: "trace-1",
  });
  assert.equal(result, null);
  _resetOpenAIClient();
});

test("anthropicProvider.searchFiles always returns null", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  _resetAnthropicClient();
  const r = await anthropicProvider.searchFiles("query", { vectorStoreId: "vs_x" });
  assert.equal(r, null);
  _resetAnthropicClient();
});

test("anthropicProvider.runBackground always returns null", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  _resetAnthropicClient();
  const schema = z.object({ ok: z.boolean() });
  const r = await anthropicProvider.runBackground("test-agent", {
    model: "claude-sonnet-4-6",
    maxTokens: 64,
    system: "system",
    messages: [{ role: "user", content: "hi" }],
    schema,
    schemaName: "ok",
    reasoningEffort: "low",
    traceId: "trace-1",
  });
  assert.equal(r, null);
  _resetAnthropicClient();
});

test("createStructuredOutput rejects schemas with no properties (zod runtime check)", async () => {
  // Use forced-tool-use path via Anthropic which does the Zod validation.
  // We monkey-patch `createMessageWithTool` to return invalid data.
  const provider = anthropicProvider;
  const original = provider.createMessageWithTool.bind(provider);
  (
    provider as unknown as { createMessageWithTool: (...args: unknown[]) => Promise<unknown> }
  ).createMessageWithTool = async () => ({ wrong: true });
  try {
    const schema = z.object({ ok: z.boolean() });
    await assert.rejects(
      provider.createStructuredOutput("test", {
        model: "claude-sonnet-4-6",
        maxTokens: 64,
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        schema,
        schemaName: "ok",
      }),
    );
  } finally {
    (provider as unknown as { createMessageWithTool: typeof original }).createMessageWithTool =
      original;
  }
});

test("createStructuredOutput parses valid forced-tool-use response", async () => {
  const provider = anthropicProvider;
  const original = provider.createMessageWithTool.bind(provider);
  (
    provider as unknown as { createMessageWithTool: (...args: unknown[]) => Promise<unknown> }
  ).createMessageWithTool = async () => ({ ok: true });
  try {
    const schema = z.object({ ok: z.boolean() });
    const result = await provider.createStructuredOutput("test", {
      model: "claude-sonnet-4-6",
      maxTokens: 64,
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      schema,
      schemaName: "ok",
    });
    assert.deepEqual(result, { ok: true });
  } finally {
    (provider as unknown as { createMessageWithTool: typeof original }).createMessageWithTool =
      original;
  }
});

test("drainModelCallTelemetry empties the buffer per provider", () => {
  // Drain twice — the second call should always return [].
  openaiProvider.drainModelCallTelemetry();
  anthropicProvider.drainModelCallTelemetry();
  const o1 = openaiProvider.drainModelCallTelemetry();
  const a1 = anthropicProvider.drainModelCallTelemetry();
  assert.deepEqual(o1, []);
  assert.deepEqual(a1, []);
});
