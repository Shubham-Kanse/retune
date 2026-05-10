/**
 * Semantic-memory resolver — alias-aware lookup over the seed catalog.
 *
 * Specialists in the comprehension layer (Title, Company) ask the resolver
 * to canonicalize a surface-form string (`"Sr. SWE II"`) into a typed
 * graph node. Lookup is case-insensitive and aliases are matched as
 * full-string equality (no fuzzy matching in commit #2; that lands when
 * the real ontology + edit-distance index ships in commit #4).
 *
 * Returns calibrated `Confidence` per resolution:
 *   - exact canonical-name match → point=1.0
 *   - exact alias match           → point=0.92
 *   - no match                    → null (caller decides fallback strategy)
 *
 * @brain angular gyrus: semantic integration / canonical lookup
 */

import { type Confidence, pointConfidence } from "@retune/types";
import { type CompanyNode, type RoleNode, SEED_COMPANIES, SEED_ROLES } from "./seed-data";

export interface RoleResolution {
  role: RoleNode;
  confidence: Confidence;
  matched_alias: string;
  match_kind: "canonical" | "alias";
}

export interface CompanyResolution {
  company: CompanyNode;
  confidence: Confidence;
  matched_alias: string;
  match_kind: "canonical" | "alias";
}

export class OntologyResolver {
  private readonly role_index: Map<string, { role: RoleNode; kind: "canonical" | "alias" }>;
  private readonly company_index: Map<
    string,
    { company: CompanyNode; kind: "canonical" | "alias" }
  >;

  constructor(
    roles: readonly RoleNode[] = SEED_ROLES,
    companies: readonly CompanyNode[] = SEED_COMPANIES,
  ) {
    this.role_index = build_role_index(roles);
    this.company_index = build_company_index(companies);
  }

  resolve_role(surface: string): RoleResolution | null {
    // Priority 1: exact match on the full surface form.
    const key = normalize(surface);
    const exact_hit = this.role_index.get(key);
    if (exact_hit) {
      return {
        role: exact_hit.role,
        confidence: pointConfidence(exact_hit.kind === "canonical" ? 1.0 : 0.92),
        matched_alias: surface,
        match_kind: exact_hit.kind,
      };
    }

    // Priority 2: strip common title suffixes (team/domain qualifiers) and retry.
    // e.g. "Senior Software Engineer — Platform" → "Senior Software Engineer"
    const SUFFIX_SPLITTERS = [" — ", " -- ", " - ", " | ", " / "];
    for (const sep of SUFFIX_SPLITTERS) {
      const idx = surface.indexOf(sep);
      if (idx > 0) {
        const stripped = surface.slice(0, idx).trim();
        const stripped_key = normalize(stripped);
        const stripped_hit = this.role_index.get(stripped_key);
        if (stripped_hit) {
          return {
            role: stripped_hit.role,
            confidence: pointConfidence(0.88),
            matched_alias: stripped,
            match_kind: stripped_hit.kind,
          };
        }
      }
    }

    // Priority 3: first-4-words prefix match (handles "Senior Software Engineer II — …").
    const words = normalize(surface).split(" ");
    if (words.length > 4) {
      const prefix_key = words.slice(0, 4).join(" ");
      const prefix_hit = this.role_index.get(prefix_key);
      if (prefix_hit) {
        return {
          role: prefix_hit.role,
          confidence: pointConfidence(0.8),
          matched_alias: prefix_key,
          match_kind: prefix_hit.kind,
        };
      }
    }

    return null;
  }

  resolve_company(surface: string): CompanyResolution | null {
    const key = normalize(surface);
    const hit = this.company_index.get(key);
    if (!hit) return null;
    return {
      company: hit.company,
      confidence: pointConfidence(hit.kind === "canonical" ? 1.0 : 0.92),
      matched_alias: surface,
      match_kind: hit.kind,
    };
  }

  /** Diagnostic: count loaded entities. */
  size(): { roles: number; companies: number } {
    return {
      roles: new Set(Array.from(this.role_index.values()).map((v) => v.role.canonical_id)).size,
      companies: new Set(Array.from(this.company_index.values()).map((v) => v.company.canonical_id))
        .size,
    };
  }
}

function build_role_index(
  roles: readonly RoleNode[],
): Map<string, { role: RoleNode; kind: "canonical" | "alias" }> {
  const index = new Map<string, { role: RoleNode; kind: "canonical" | "alias" }>();
  for (const role of roles) {
    index.set(normalize(role.display_name), { role, kind: "canonical" });
    for (const alias of role.aliases) {
      const key = normalize(alias);
      // Don't overwrite a canonical hit with an alias.
      if (!index.has(key)) index.set(key, { role, kind: "alias" });
    }
  }
  return index;
}

function build_company_index(
  companies: readonly CompanyNode[],
): Map<string, { company: CompanyNode; kind: "canonical" | "alias" }> {
  const index = new Map<string, { company: CompanyNode; kind: "canonical" | "alias" }>();
  for (const company of companies) {
    index.set(normalize(company.display_name), { company, kind: "canonical" });
    for (const alias of company.aliases) {
      const key = normalize(alias);
      if (!index.has(key)) index.set(key, { company, kind: "alias" });
    }
  }
  return index;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}
