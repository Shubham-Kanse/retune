/**
 * Anthropic tool-retry behaviour (technical-2.0 §4 / §17.3).
 *
 * Verifies that when the SDK reports `stop_reason: "max_tokens"` because the
 * model ran out of budget before completing its tool call, the provider
 * retries once with `max_tokens × 2` (capped at 16k). Previously this test
 * exercised internal exports (`client`, `extractToolUse`) that no longer
 * exist after the v1.0 → provider-abstraction refactor; v2.0 routes through
 * the public `anthropicProvider` and patches its underlying `createMessage`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { AIResponse } from "../src/lib/ai-provider";
import { anthropicProvider } from "../src/lib/providers/anthropic";

function mkResponse(args: {
  stopReason: AIResponse["stopReason"];
  content: AIResponse["content"];
}): AIResponse {
  return {
    content: args.content,
    stopReason: args.stopReason,
    usage: {
      inputTokens: 10,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    model: "claude-test",
  };
}

test("createMessageWithTool retries once with doubled max_tokens after max_tokens truncation", async () => {
  const calls: number[] = [];
  const originalCreate = anthropicProvider.createMessage.bind(anthropicProvider);

  anthropicProvider.createMessage = async (_agent, params) => {
    calls.push(params.maxTokens);
    if (calls.length === 1) {
      return mkResponse({
        stopReason: "max_tokens",
        content: [{ type: "text", text: "truncated" }],
      });
    }
    return mkResponse({
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "submit_evidence_map",
          input: { recovered: true },
        },
      ],
    });
  };

  try {
    const toolInput = await anthropicProvider.createMessageWithTool<{ recovered: boolean }>(
      "test-agent",
      {
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
        system: "test",
        tools: [
          {
            name: "submit_evidence_map",
            description: "submit",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        forceTool: "submit_evidence_map",
        messages: [{ role: "user", content: "go" }],
      },
      "submit_evidence_map",
    );
    assert.equal(toolInput.recovered, true);
    assert.deepEqual(calls, [1024, 2048]);
  } finally {
    anthropicProvider.createMessage = originalCreate;
  }
});

test("createMessageWithTool surfaces a tool block even when stop_reason is max_tokens", async () => {
  const originalCreate = anthropicProvider.createMessage.bind(anthropicProvider);

  // First (and only) call returns a tool block alongside max_tokens —
  // extraction succeeds without a retry.
  anthropicProvider.createMessage = async () =>
    mkResponse({
      stopReason: "max_tokens",
      content: [
        { type: "tool_use", id: "toolu_1", name: "submit_evidence_map", input: { ok: true } },
      ],
    });

  try {
    const out = await anthropicProvider.createMessageWithTool<{ ok: boolean }>(
      "test-agent",
      {
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
        system: "test",
        tools: [
          {
            name: "submit_evidence_map",
            description: "submit",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        forceTool: "submit_evidence_map",
        messages: [{ role: "user", content: "go" }],
      },
      "submit_evidence_map",
    );
    assert.equal(out.ok, true);
  } finally {
    anthropicProvider.createMessage = originalCreate;
  }
});
