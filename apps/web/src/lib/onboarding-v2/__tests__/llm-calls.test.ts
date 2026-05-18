import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  getModels: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@retune/agent/web", () => ({
  getModels: mocks.getModels,
  getProvider: mocks.getProvider,
}));

import { callLLM, resetSessionLimits } from "../llm/calls";

describe("onboarding v2 LLM calls", () => {
  beforeEach(() => {
    resetSessionLimits();
    vi.clearAllMocks();
    mocks.getModels.mockReturnValue({
      smart: "shared-smart-model",
      fast: "shared-fast-model",
      frontier: "shared-frontier-model",
    });
    mocks.getProvider.mockReturnValue({
      createMessage: mocks.createMessage,
    });
  });

  it("routes calls through the shared agent provider", async () => {
    mocks.createMessage.mockResolvedValue({
      content: [{ type: "text", text: "provider response" }],
      stopReason: "end_turn",
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      model: "shared-smart-model",
      providerResponseId: "provider-response-id",
    });

    const result = await callLLM({
      systemPrompt: "system prompt",
      userMessage: "user message",
      model: "smart",
      temperature: 0,
      maxTokens: 123,
      stage: 2,
      callName: "pure_extraction",
    });

    expect(mocks.getProvider).toHaveBeenCalledTimes(1);
    expect(mocks.getModels).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage).toHaveBeenCalledWith("onboarding-v2:2:pure_extraction", {
      model: "shared-smart-model",
      maxTokens: 123,
      system: "system prompt",
      messages: [{ role: "user", content: "user message" }],
    });
    expect(result).toMatchObject({
      content: "provider response",
      inputTokens: 12,
      outputTokens: 7,
    });
  });
});
