import "@/styles/globals.css";

import { NavGuardProvider } from "@/components/layout/nav-guard-provider";
import { PostHogProvider } from "@/components/posthog-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getActiveMessages } from "@/i18n/messages";
import { logWebStartupDiagnostics, resolveAppUrl } from "@/lib/startup-diagnostics";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Geist_Mono, Inter } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: { default: "Retuned", template: "%s | Retuned" },
  description:
    "Paste a job description. Get a tailored resume, cover letter, and application strategy in under 3 minutes.",
  metadataBase: resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Retuned",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.svg",
    shortcut: "/favicon.svg",
  },
};

logWebStartupDiagnostics();

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getActiveMessages();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={200}>
              <>
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <PostHogProvider>
                      <NavGuardProvider>{children}</NavGuardProvider>
                    </PostHogProvider>
                  </Suspense>
                </ErrorBoundary>
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    className: "border border-border bg-popover text-popover-foreground",
                  }}
                />
                <ServiceWorkerRegister />
              </>
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
