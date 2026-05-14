/**
 * chat-ui.ts
 * Shared layout constants for the onboarding chat.
 * Every component and wrapper should align to CHAT_GUTTER_PX so that
 * bubbles, attached cards, chips and the upload dropzone all share the
 * same left edge as the assistant avatar + gap.
 */

/** Assistant avatar diameter in px (Tailwind w-8 = 32). */
export const CHAT_AVATAR_PX = 32;

/** Gap between avatar and bubble in px (Tailwind gap-2 = 8). */
export const CHAT_AVATAR_GAP_PX = 8;

/**
 * Left gutter for any element that should line up with an assistant
 * bubble (chips, cards, the upload dropzone). Equals avatar + gap.
 *
 * Tailwind utility: `ml-10` (40px).
 */
export const CHAT_GUTTER_PX = CHAT_AVATAR_PX + CHAT_AVATAR_GAP_PX;

/** Tailwind class equivalent to `CHAT_GUTTER_PX` left margin. */
export const CHAT_GUTTER_CLASS = "ml-10";

/** Fallback copy when the greeting stream fails. */
export const GREETING_FALLBACK_CONTENT =
  "Hi, I'm Retuned. Upload your resume and I'll build your career profile from it.";

/** Fallback chips that accompany the greeting fallback. */
export const GREETING_FALLBACK_CHIPS = ["Upload resume"] as const;

/** The chip label that opens the file dropzone (not sent to the server). */
export const UPLOAD_CHIP_LABEL = "Upload resume";
