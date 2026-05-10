/**
 * API client for calling the Hono API service.
 *
 * Replaces direct SQLite database access with HTTP calls to the cognitive API.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

export interface Application {
  id: string;
  status: "generating" | "completed";
  ticks_executed: number;
  total_cost_usd: number;
  created_at: string;
  completed_at: string | null;
  termination: string | null;
}

export interface ApplicationDetail extends Application {
  user_id: string;
  jd_id: string | null;
  blackboard: Blackboard;
}

export interface Blackboard {
  generation_id: string;
  user_id: string;
  jd_id: string;
  market: "US" | "UK";
  draft: {
    sections: Record<string, Section>;
    bullets: Record<string, Bullet>;
    cover_letter_text?: string;
    strategy_text?: string;
  };
  hypotheses: {
    role_schema: RoleSchema | null;
    company_schema: CompanySchema | null;
    chosen_narrative_arc: NarrativeArc | null;
  };
  outcome_estimate: OutcomeEstimate | null;
}

export interface Section {
  id: string;
  kind: "skills" | "experience" | "summary" | "education" | "projects";
  bullet_ids: string[];
  rendered_text?: string;
}

export interface Bullet {
  id: string;
  section_id: string;
  text: string;
  template_family: "CAR" | "PAR" | "XYZ" | "STAR" | "hybrid";
  verb_quality: "weak" | "standard" | "strong" | "elite";
  evidence_span_ids: string[];
  voice_drift_cosine: number;
}

export interface RoleSchema {
  canonical_role_id: string;
  display_name: string;
  level: string;
}

export interface CompanySchema {
  canonical_company_id: string;
  display_name: string;
  tier: string;
}

export interface NarrativeArc {
  archetype: string;
  thesis: string;
}

export interface OutcomeEstimate {
  interview_probability: number;
  confidence: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async getApplications(): Promise<Application[]> {
    const response = await fetch(`${this.baseUrl}/applications`);
    if (!response.ok) {
      throw new Error(`Failed to fetch applications: ${response.statusText}`);
    }
    const data = await response.json();
    return data.applications;
  }

  async getApplication(id: string): Promise<ApplicationDetail> {
    const response = await fetch(`${this.baseUrl}/applications/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch application: ${response.statusText}`);
    }
    return response.json();
  }

  async getBlackboard(id: string): Promise<Blackboard> {
    const response = await fetch(`${this.baseUrl}/applications/${id}/blackboard`);
    if (!response.ok) {
      throw new Error(`Failed to fetch blackboard: ${response.statusText}`);
    }
    return response.json();
  }

  async createApplication(data: {
    jd_text: string;
    jd_url?: string;
    company?: string;
    role_title?: string;
    market?: "US" | "UK";
  }): Promise<{ generation_id: string; runtime: string }> {
    const response = await fetch(`${this.baseUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to create application" }));
      throw new Error(error.error || "Failed to create application");
    }
    return response.json();
  }

  getStreamUrl(id: string): string {
    return `${this.baseUrl}/generate/${id}/stream`;
  }
}

export const apiClient = new ApiClient();
