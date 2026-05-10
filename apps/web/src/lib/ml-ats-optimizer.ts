interface ATSPattern {
  pattern: RegExp;
  weight: number;
  category: "keywords" | "format" | "structure" | "length";
  description: string;
}

interface ATSAnalysis {
  score: number;
  breakdown: Record<string, number>;
  suggestions: string[];
  keywords: { found: string[]; missing: string[]; density: number };
  readability: number;
  structure: number;
}

class MLATSOptimizer {
  private patterns: ATSPattern[] = [
    // Keyword patterns
    {
      pattern: /\b(python|javascript|react|node\.?js|aws|docker|kubernetes)\b/gi,
      weight: 2,
      category: "keywords",
      description: "Technical skills",
    },
    {
      pattern: /\b(led|managed|developed|implemented|optimized|achieved)\b/gi,
      weight: 1.5,
      category: "keywords",
      description: "Action verbs",
    },
    {
      pattern: /\b(\d+%|\d+x|\$\d+k?|\d+\+?\s*(years?|months?))\b/gi,
      weight: 2,
      category: "keywords",
      description: "Quantified achievements",
    },

    // Format patterns
    {
      pattern: /^[A-Z][a-z]+\s+[A-Z][a-z]+$/m,
      weight: 1,
      category: "format",
      description: "Proper name format",
    },
    {
      pattern: /\b[A-Z][a-z]+\s+\d{4}\s*-\s*(\d{4}|Present)\b/g,
      weight: 1,
      category: "format",
      description: "Date ranges",
    },
    { pattern: /^\s*•\s+/gm, weight: 0.5, category: "format", description: "Bullet points" },

    // Structure patterns
    {
      pattern: /\b(experience|education|skills|projects)\b/gi,
      weight: 1,
      category: "structure",
      description: "Standard sections",
    },
    {
      pattern: /\b(summary|objective|profile)\b/gi,
      weight: 0.8,
      category: "structure",
      description: "Professional summary",
    },

    // Length patterns
    { pattern: /.{1,2000}/s, weight: 1, category: "length", description: "Appropriate length" },
  ];

  private industryKeywords = new Map<string, string[]>([
    ["tech", ["agile", "scrum", "ci/cd", "microservices", "api", "database", "cloud", "devops"]],
    [
      "marketing",
      ["seo", "sem", "analytics", "conversion", "roi", "campaign", "brand", "social media"],
    ],
    [
      "finance",
      ["financial modeling", "risk management", "compliance", "audit", "portfolio", "derivatives"],
    ],
    [
      "healthcare",
      ["hipaa", "clinical", "patient care", "medical records", "healthcare", "treatment"],
    ],
  ]);

  analyzeResume(resumeText: string, jobDescription: string): ATSAnalysis {
    const jdKeywords = this.extractKeywords(jobDescription);
    const resumeKeywords = this.extractKeywords(resumeText);

    // Calculate keyword matching
    const foundKeywords = jdKeywords.filter((kw) =>
      resumeKeywords.some((rw) => rw.toLowerCase().includes(kw.toLowerCase())),
    );
    const missingKeywords = jdKeywords.filter(
      (kw) => !resumeKeywords.some((rw) => rw.toLowerCase().includes(kw.toLowerCase())),
    );

    const keywordScore = (foundKeywords.length / Math.max(jdKeywords.length, 1)) * 100;
    const keywordDensity = foundKeywords.length / resumeText.split(/\s+/).length;

    // Calculate pattern scores
    const breakdown: Record<string, number> = {};
    let totalScore = 0;
    let totalWeight = 0;

    for (const pattern of this.patterns) {
      const matches = resumeText.match(pattern.pattern);
      const score = matches ? Math.min(matches.length * 10, 100) : 0;
      breakdown[pattern.category] = (breakdown[pattern.category] || 0) + score * pattern.weight;
      totalScore += score * pattern.weight;
      totalWeight += pattern.weight;
    }

    // Normalize scores
    for (const category in breakdown) {
      breakdown[category] = Math.min((breakdown[category] ?? 0) / 10, 100);
    }

    // Calculate readability (simplified Flesch score)
    const readability = this.calculateReadability(resumeText);

    // Calculate structure score
    const structure = this.calculateStructureScore(resumeText);

    // Generate suggestions
    const suggestions = this.generateSuggestions(
      breakdown,
      missingKeywords,
      readability,
      structure,
    );

    const finalScore = Math.min(
      keywordScore * 0.4 + (totalScore / totalWeight) * 0.3 + readability * 0.15 + structure * 0.15,
      100,
    );

    return {
      score: Math.round(finalScore),
      breakdown: {
        keywords: Math.round(keywordScore),
        format: Math.round(breakdown.format || 0),
        structure: Math.round(structure),
        readability: Math.round(readability),
      },
      suggestions,
      keywords: {
        found: foundKeywords,
        missing: missingKeywords.slice(0, 10), // Top 10 missing
        density: Math.round(keywordDensity * 1000) / 1000,
      },
      readability: Math.round(readability),
      structure: Math.round(structure),
    };
  }

  private extractKeywords(text: string): string[] {
    // Extract meaningful keywords using NLP-like techniques
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);

    // Remove common stop words
    const stopWords = new Set([
      "the",
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
    ]);
    const filtered = words.filter((word) => !stopWords.has(word));

    // Extract n-grams for better matching
    const ngrams: string[] = [];
    for (let i = 0; i < filtered.length - 1; i++) {
      ngrams.push(`${filtered[i]} ${filtered[i + 1]}`);
    }

    return [...new Set([...filtered, ...ngrams])];
  }

  private calculateReadability(text: string): number {
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const syllables = text.split(/[aeiou]/gi).length;

    if (sentences === 0 || words === 0) return 0;

    // Simplified Flesch Reading Ease
    const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    return Math.max(0, Math.min(100, score));
  }

  private calculateStructureScore(text: string): number {
    let score = 0;

    // Check for standard sections
    const sections = ["experience", "education", "skills", "summary"];
    for (const section of sections) {
      if (new RegExp(section, "i").test(text)) score += 20;
    }

    // Check for proper formatting
    if (/^\s*[A-Z][a-z]+\s+[A-Z][a-z]+/m.test(text)) score += 10; // Name
    if (/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/.test(text)) score += 10; // Email
    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text)) score += 10; // Phone

    return Math.min(score, 100);
  }

  private generateSuggestions(
    breakdown: Record<string, number>,
    missingKeywords: string[],
    readability: number,
    structure: number,
  ): string[] {
    const suggestions: string[] = [];

    if ((breakdown.keywords ?? 0) < 70) {
      suggestions.push(`Add more relevant keywords: ${missingKeywords.slice(0, 5).join(", ")}`);
    }

    if ((breakdown.format ?? 0) < 60) {
      suggestions.push("Improve formatting with consistent bullet points and date ranges");
    }

    if (structure < 70) {
      suggestions.push(
        "Add standard sections: Professional Summary, Experience, Education, Skills",
      );
    }

    if (readability < 50) {
      suggestions.push("Simplify language and use shorter sentences for better readability");
    }

    if (missingKeywords.length > 10) {
      suggestions.push("Consider adding more industry-specific terminology");
    }

    return suggestions;
  }

  optimizeForATS(resumeText: string, jobDescription: string): string {
    const analysis = this.analyzeResume(resumeText, jobDescription);
    let optimized = resumeText;

    // Auto-add missing high-value keywords
    const highValueMissing = analysis.keywords.missing.filter((kw) => kw.length > 3).slice(0, 3);

    if (highValueMissing.length > 0) {
      const skillsSection = "\n\nAdditional Skills:\n• " + highValueMissing.join("\n• ");
      optimized += skillsSection;
    }

    return optimized;
  }
}

export const mlATS = new MLATSOptimizer();
