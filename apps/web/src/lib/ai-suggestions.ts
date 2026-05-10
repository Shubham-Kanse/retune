interface ContentSuggestion {
  id: string;
  type: "improvement" | "addition" | "replacement";
  section: string;
  original: string;
  suggested: string;
  reason: string;
  confidence: number;
}

class AIContentSuggestions {
  private suggestions = new Map<string, ContentSuggestion[]>();

  async generateSuggestions(
    applicationId: string,
    content: string,
    jobDescription: string,
  ): Promise<ContentSuggestion[]> {
    // Simulate AI analysis - in production, this would call Claude
    const suggestions: ContentSuggestion[] = [];

    // Analyze for missing keywords
    const jdKeywords = this.extractKeywords(jobDescription);
    const contentKeywords = this.extractKeywords(content);
    const missingKeywords = jdKeywords.filter((k) => !contentKeywords.includes(k));

    if (missingKeywords.length > 0) {
      suggestions.push({
        id: `missing-keywords-${Date.now()}`,
        type: "addition",
        section: "skills",
        original: "",
        suggested: `Consider adding: ${missingKeywords.slice(0, 3).join(", ")}`,
        reason: "These keywords from the job description are missing",
        confidence: 0.8,
      });
    }

    // Analyze for weak action verbs
    const weakVerbs = ["did", "was", "had", "got"];
    const strongVerbs = ["achieved", "implemented", "optimized", "delivered"];

    for (const weak of weakVerbs) {
      if (content.toLowerCase().includes(weak)) {
        suggestions.push({
          id: `weak-verb-${weak}-${Date.now()}`,
          type: "replacement",
          section: "experience",
          original: weak,
          suggested: strongVerbs[Math.floor(Math.random() * strongVerbs.length)] ?? "delivered",
          reason: "Use stronger action verbs to show impact",
          confidence: 0.9,
        });
      }
    }

    // Analyze for quantification opportunities
    if (!/\d+%|\d+x|\$\d+/.test(content)) {
      suggestions.push({
        id: `quantify-${Date.now()}`,
        type: "improvement",
        section: "experience",
        original: "achievements",
        suggested: "Add specific numbers, percentages, or dollar amounts",
        reason: "Quantified achievements are more impactful",
        confidence: 0.85,
      });
    }

    this.suggestions.set(applicationId, suggestions);
    return suggestions;
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !["the", "and", "for", "with", "this", "that"].includes(word));
  }

  getSuggestions(applicationId: string): ContentSuggestion[] {
    return this.suggestions.get(applicationId) || [];
  }

  applySuggestion(applicationId: string, suggestionId: string): void {
    const suggestions = this.suggestions.get(applicationId) || [];
    const updated = suggestions.filter((s) => s.id !== suggestionId);
    this.suggestions.set(applicationId, updated);
  }

  dismissSuggestion(applicationId: string, suggestionId: string): void {
    this.applySuggestion(applicationId, suggestionId);
  }
}

export const aiSuggestions = new AIContentSuggestions();
