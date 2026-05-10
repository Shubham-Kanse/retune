import { z } from "zod";

/**
 * Voice fingerprint — 64-dim stylometric vector capturing the user's
 * function-word distribution, sentence-length variance, dependency depth,
 * and hedge density (PRD §6.2 specialist S7).
 *
 * @brain cerebellum: fine motor / production-style adjustment
 */
export const VOICE_DIM = 64;

export const VoiceCentroidSchema = z.object({
  user_id: z.string().uuid(),
  vector: z.array(z.number()).length(VOICE_DIM),
  sample_size: z.number().int().nonnegative(),
  last_updated_at: z.string().datetime(),
});
export type VoiceCentroid = z.infer<typeof VoiceCentroidSchema>;

export const VoiceTonePreferenceSchema = z.enum(["confident", "measured", "understated"]);
export type VoiceTonePreference = z.infer<typeof VoiceTonePreferenceSchema>;
