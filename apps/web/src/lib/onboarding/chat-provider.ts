/**
 * chat-provider.ts
 * Thin streaming adapter for onboarding chat turns.
 * Swapping providers is a one-line env var change: AI_PROVIDER=openai|anthropic
 *
 * Returns a ReadableStream of text chunks (token-by-token).
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatParams {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

const OPENAI_MODEL = process.env.OPENAI_NANO_MODEL ?? "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.AGENT_MODEL_FAST ?? "claude-haiku-4-5";

/**
 * Returns a ReadableStream that emits text chunks as they arrive from the provider.
 * Caller pipes this directly into the SSE response.
 */
export function streamChatTurn(params: StreamChatParams): ReadableStream<string> {
  const provider = process.env.AI_PROVIDER ?? "openai";
  return provider === "anthropic"
    ? streamAnthropic(params)
    : streamOpenAI(params);
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

function streamOpenAI({ system, messages, maxTokens = 512 }: StreamChatParams): ReadableStream<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model: OPENAI_MODEL,
          max_tokens: maxTokens,
          stream: true,
          messages: [
            { role: "system", content: system },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) controller.enqueue(text);
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

function streamAnthropic({ system, messages, maxTokens = 512 }: StreamChatParams): ReadableStream<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const stream = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          stream: true,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(event.delta.text);
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}
