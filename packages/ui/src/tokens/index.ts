/**
 * Token exports (Charter 10 Epic 02).
 *
 * Source of truth: packages/ui/tokens.json (W3C Design Tokens format).
 *
 * Three-layer architecture:
 *   primitive  → raw values (not used directly in components)
 *   semantic   → CSS custom properties in apps/web/src/styles/globals.css
 *   cognitive  → pipeline-state colors (this file)
 *
 * The semantic layer is consumed by Tailwind v4 via @theme {} in globals.css.
 * The cognitive layer is consumed by packages/ui/src/cognitive/* components.
 */
export { cognitiveColors, emotionColors, tailwindCognitiveColors } from "./cognitive-palette";
