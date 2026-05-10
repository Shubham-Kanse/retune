interface CacheEntry<T> {
  data: T;
  expires: number;
  hits: number;
  lastAccessed: number;
  tags: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

class AdvancedMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 2000;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 };
  private tagIndex = new Map<string, Set<string>>();

  set<T>(key: string, data: T, ttlMs = 300000, tags: string[] = []): void {
    // Evict expired entries first
    this.evictExpired();

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // Remove old entry from tag index
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.removeFromTagIndex(key, oldEntry.tags);
    }

    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + ttlMs,
      hits: 0,
      lastAccessed: Date.now(),
      tags,
    };

    this.cache.set(key, entry);
    this.addToTagIndex(key, tags);
    this.stats.size = this.cache.size;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expires) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    return entry.data;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.removeFromTagIndex(key, entry.tags);
    this.cache.delete(key);
    this.stats.size = this.cache.size;
    return true;
  }

  deleteByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) deleted++;
    }
    return deleted;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry ? Date.now() <= entry.expires : false;
  }

  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
  }

  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  getKeys(pattern?: string): string[] {
    const keys = Array.from(this.cache.keys());
    if (!pattern) return keys;

    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return keys.filter((key) => regex.test(key));
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.delete(key);
        this.stats.evictions++;
      }
    }
  }

  private evictLRU(): void {
    let oldestKey = "";
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private addToTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  private removeFromTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}

export const cache = new AdvancedMemoryCache();
