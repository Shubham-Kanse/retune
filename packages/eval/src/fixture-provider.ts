/**
 * FixtureBackedProvider — mock-mode prompt-hash cache.
 *
 * Three modes:
 *   - mock:   Serves responses from the fixture cache. Throws if cache miss.
 *   - record: Calls the real provider, saves response to cache, returns it.
 *   - live:   Calls the real provider without touching the cache.
 *
 * Cache format: JSON files at `<cache_dir>/<sha256(prompt_hash)>.json`
 * where prompt_hash = sha256(model + system + messages + tools + forceTool).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type FixtureMode = "mock" | "record" | "live";

export interface MessageParams {
  model: string;
  maxTokens: number;
  system: unknown;
  messages: unknown[];
  tools?: unknown[];
  forceTool?: string;
}

export interface AIResponse {
  content: unknown[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  model: string;
}

export interface RealProvider {
  createMessage(agent: string, params: MessageParams): Promise<AIResponse>;
}

export class FixtureBackedProvider {
  private readonly cacheDir: string;
  private readonly mode: FixtureMode;
  private readonly real: RealProvider | null;
  private hits = 0;
  private misses = 0;

  constructor(opts: { cacheDir: string; mode: FixtureMode; real?: RealProvider | null }) {
    this.cacheDir = opts.cacheDir;
    this.mode = opts.mode;
    this.real = opts.real ?? null;

    if (this.mode !== "live") {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async createMessage(agent: string, params: MessageParams): Promise<AIResponse> {
    const hash = this.computeHash(params);

    if (this.mode === "mock") {
      return this.loadFromCache(hash);
    }

    if (this.mode === "record") {
      const cached = this.tryLoadFromCache(hash);
      if (cached) {
        this.hits++;
        return cached;
      }
      const response = await this.callReal(agent, params);
      this.saveToCache(hash, response);
      this.misses++;
      return response;
    }

    // live mode
    return this.callReal(agent, params);
  }

  getStats(): { hits: number; misses: number; mode: FixtureMode } {
    return { hits: this.hits, misses: this.misses, mode: this.mode };
  }

  private computeHash(params: MessageParams): string {
    const payload = JSON.stringify({
      model: params.model,
      system: params.system,
      messages: params.messages,
      tools: params.tools ?? null,
      forceTool: params.forceTool ?? null,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  private loadFromCache(hash: string): AIResponse {
    const path = this.cachePath(hash);
    if (!existsSync(path)) {
      throw new Error(
        `FixtureBackedProvider: cache miss in mock mode (hash=${hash.slice(0, 12)}...). Run with --record first.`,
      );
    }
    this.hits++;
    return JSON.parse(readFileSync(path, "utf-8")) as AIResponse;
  }

  private tryLoadFromCache(hash: string): AIResponse | null {
    const path = this.cachePath(hash);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as AIResponse;
  }

  private saveToCache(hash: string, response: AIResponse): void {
    const path = this.cachePath(hash);
    writeFileSync(path, JSON.stringify(response, null, 2), "utf-8");
  }

  private cachePath(hash: string): string {
    return resolve(this.cacheDir, `${hash}.json`);
  }

  private async callReal(agent: string, params: MessageParams): Promise<AIResponse> {
    if (!this.real) {
      throw new Error("FixtureBackedProvider: no real provider configured for live/record mode");
    }
    return this.real.createMessage(agent, params);
  }
}
