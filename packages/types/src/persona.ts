import { z } from "zod";

/**
 * Persona — the two committed user types per PRD §1.3.
 * Anything else is out of scope at launch (PRD §19.1).
 *
 * @brain vmPFC: identity / self-other distinction
 */
export const PersonaSchema = z.enum(["new_grad", "experienced"]);
export type Persona = z.infer<typeof PersonaSchema>;
