import { z } from "zod";

/**
 * Market — locales supported at launch per PRD §1.3.
 * Locale-specific resume conventions live in `packages/agent/src/locale/`.
 */
export const MarketSchema = z.enum(["US", "UK", "EU", "IN", "CA", "AU"]);
export type Market = z.infer<typeof MarketSchema>;

export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "BCP-47 locale required (e.g. en-US)");
export type Locale = z.infer<typeof LocaleSchema>;
