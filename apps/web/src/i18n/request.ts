/**
 * next-intl request config (Charter 16).
 *
 * Resolves the active locale + messages for server components calling
 * `getTranslations()` from `next-intl/server`. Delegates to our own
 * cookie + accept-language resolver in `./messages.ts` so server and
 * client render with the same bundle.
 *
 * Wired via `createNextIntlPlugin` in `next.config.ts`.
 */

import { getRequestConfig } from "next-intl/server";
import { getActiveMessages } from "./messages";

export default getRequestConfig(async () => {
  const { locale, messages } = await getActiveMessages();
  return {
    locale,
    messages,
  };
});
