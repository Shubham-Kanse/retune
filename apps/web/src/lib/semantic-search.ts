interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: "application" | "resume" | "cover_letter" | "strategy";
  score: number;
  highlights: string[];
  metadata: Record<string, any>;
}

interface SearchIndex {
  [key: string]: {
    content: string;
    tokens: string[];
    embeddings?: number[];
    metadata: Record<string, any>;
  };
}

class SemanticSearchEngine {
  private index: SearchIndex = {};
  private stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
  ]);

  addDocument(id: string, content: string, type: string, metadata: Record<string, any> = {}): void {
    const tokens = this.tokenize(content);
    const embeddings = this.generateEmbeddings(tokens);

    this.index[id] = {
      content,
      tokens,
      embeddings,
      metadata: { ...metadata, type },
    };
  }

  search(
    query: string,
    options: {
      limit?: number;
      type?: string;
      threshold?: number;
      fuzzy?: boolean;
    } = {},
  ): SearchResult[] {
    const { limit = 10, type, threshold = 0.1, fuzzy = true } = options;

    const queryTokens = this.tokenize(query);
    const queryEmbeddings = this.generateEmbeddings(queryTokens);

    const results: SearchResult[] = [];

    for (const [id, doc] of Object.entries(this.index)) {
      if (type && doc.metadata.type !== type) continue;

      // Calculate semantic similarity
      const semanticScore = this.cosineSimilarity(queryEmbeddings, doc.embeddings || []);

      // Calculate keyword matching score
      const keywordScore = this.calculateKeywordScore(queryTokens, doc.tokens);

      // Calculate fuzzy matching score
      const fuzzyScore = fuzzy ? this.calculateFuzzyScore(query, doc.content) : 0;

      // Combined score with weights
      const combinedScore = semanticScore * 0.5 + keywordScore * 0.3 + fuzzyScore * 0.2;

      if (combinedScore >= threshold) {
        const highlights = this.generateHighlights(query, doc.content);

        results.push({
          id,
          title: doc.metadata.title || id,
          content: doc.content,
          type: doc.metadata.type,
          score: combinedScore,
          highlights,
          metadata: doc.metadata,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !this.stopWords.has(token));
  }

  private generateEmbeddings(tokens: string[]): number[] {
    // Simplified embedding generation using character-based hashing
    // In production, this would use a proper embedding model
    const embedding = new Array(100).fill(0);

    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) - hash + token.charCodeAt(i)) & 0xffffffff;
      }

      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map((val) => val / magnitude) : embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aValue = a[i] ?? 0;
      const bValue = b[i] ?? 0;
      dotProduct += aValue * bValue;
      normA += aValue * aValue;
      normB += bValue * bValue;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  private calculateKeywordScore(queryTokens: string[], docTokens: string[]): number {
    const docTokenSet = new Set(docTokens);
    const matches = queryTokens.filter((token) => docTokenSet.has(token));
    return queryTokens.length > 0 ? matches.length / queryTokens.length : 0;
  }

  private calculateFuzzyScore(query: string, content: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    // Simple fuzzy matching using Levenshtein distance
    const words = contentLower.split(/\s+/);
    let bestScore = 0;

    for (const word of words) {
      const distance = this.levenshteinDistance(queryLower, word);
      const score = Math.max(0, 1 - distance / Math.max(queryLower.length, word.length));
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0]![i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j]![0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j]![i] = Math.min(
          matrix[j]![i - 1] + 1,
          matrix[j - 1]![i] + 1,
          matrix[j - 1]![i - 1] + indicator,
        );
      }
    }

    return matrix[b.length]![a.length] ?? 0;
  }

  private generateHighlights(query: string, content: string, maxHighlights = 3): string[] {
    const queryTokens = this.tokenize(query);
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const highlights: Array<{ sentence: string; score: number }> = [];

    for (const sentence of sentences) {
      const sentenceTokens = this.tokenize(sentence);
      const score = this.calculateKeywordScore(queryTokens, sentenceTokens);

      if (score > 0) {
        highlights.push({ sentence: sentence.trim(), score });
      }
    }

    return highlights
      .sort((a, b) => b.score - a.score)
      .slice(0, maxHighlights)
      .map((h) => h.sentence);
  }

  removeDocument(id: string): void {
    delete this.index[id];
  }

  clear(): void {
    this.index = {};
  }

  getStats(): { totalDocuments: number; totalTokens: number } {
    const totalDocuments = Object.keys(this.index).length;
    const totalTokens = Object.values(this.index).reduce((sum, doc) => sum + doc.tokens.length, 0);

    return { totalDocuments, totalTokens };
  }
}

export const semanticSearch = new SemanticSearchEngine();
