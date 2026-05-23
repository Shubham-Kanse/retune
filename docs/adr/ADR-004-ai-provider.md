# ADR-004 — AI Provider: Vendor-Agnostic Facade with Anthropic-Default + OpenAI-Fallback

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: AI/ML engineering
**Charter**: 09-AI-ML, 04-Resilience

## Context

Every specialist in `packages/agent/src/specialists/` reaches for an LLM. The naive cut imports `anthropic` directly in each specialist. Three problems:

1. **Vendor coupling.** Switching to OpenAI for a specific model becomes a 30-file refactor.
2. **No telemetry.** Each specialist owns its own try/catch, retry, and cost accounting (or worse, doesn't).
3. **No concurrency control.** Eight specialists firing in parallel can trip provider rate limits and burn cost.

## Decision

Specialists call **`getProvider()`** from `packages/agent/src/lib/provider.ts`, which returns an `AIProvider` interface implementing:

```ts
interface AIProvider {
  capabilities: ProviderCapabilities;
  createMessage(agent, params): Promise<AIResponse>;
  createMessageWithTool<T>(agent, params, toolName): Promise<T>;
  createStructuredOutput<T>(agent, params): Promise<T>;
  createReasonedOutput<T>(agent, params): Promise<T>;
  searchWeb(...);
  searchFiles(...);
  runBackground(...);
}
```

Two implementations:

- `anthropicProvider` (`packages/agent/src/lib/providers/anthropic/`) — default.
- `openaiProvider` (`packages/agent/src/lib/providers/openai/`) — selected via `AI_PROVIDER=openai`.

Both providers ship through a `wrapWithConcurrency()` decorator that funnels every call through `ConcurrencyManager` (5 global / 2 per agent). Override via `RETUNE_LLM_GLOBAL_LIMIT` / `RETUNE_LLM_PER_USER_LIMIT`.

The decorator exposes the provider's `capabilities` object by reference, so identity tests like "did we get the openai provider?" assert on `provider.capabilities === openaiProvider.capabilities`.

## Consequences

**Positive**:

- Zero specialist code changes when switching provider — env-var flip only.
- Concurrency limits are global, not per-call-site, so no specialist can hog the budget.
- Capability flags (`structuredOutput`, `reasoningEffort`, `webSearch`, `fileSearch`, `backgroundRuns`, `promptCaching`) are part of the contract; specialists branch on capability rather than vendor name.
- Telemetry hooks (`drainModelCallTelemetry`) are provider-agnostic.

**Negative**:

- The facade adds a level of indirection vs direct vendor SDK usage. Stack traces from the specialist go through `provider.createMessage` instead of straight into the SDK.
- New SDK features (e.g. Anthropic prompt-caching beta) require updating both the interface and both implementations; if the interface is wrong we delay adoption.
- Anthropic and OpenAI tool-use shapes diverge significantly; the facade hides that, but `extractToolUseBlock<T>` has to handle both. We've accepted this complexity in the providers; nothing leaks to specialists.

## Wire-Up Notes

- The onboarding-v2 LLM helper (`apps/web/src/lib/onboarding-v2/llm/calls.ts`) routes through the same provider — no second provider abstraction.
- Circuit breakers: the LLM calls go through the concurrency manager + provider retry. ML calls go through their own `MLClient.breaker` (5 failures / 60s). Jina fetches go through a separate breaker (3 failures / 30s). See ADR-006.

## Alternatives Considered

- **Direct vendor SDK in each specialist**: rejected for the three problems above.
- **LangChain abstraction**: rejected because LangChain hides too much (prompt construction, retry timing, token accounting) and adds a heavy dependency for what we'd shed in 6 months.
- **Vercel AI SDK**: viable, but does not give us the structured-output / forced-tool-use surface in the shape our specialists want, and would force us to re-implement concurrency/retry on top of it.

## References

- `packages/agent/src/lib/provider.ts`
- `packages/agent/src/lib/ai-provider.ts`
- `packages/agent/src/lib/providers/anthropic/`
- `packages/agent/src/lib/providers/openai/`
- `packages/agent/src/concurrency/concurrency-manager.ts`
- `docs/charters/09-ai-ml/README.md`
