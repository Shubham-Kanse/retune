import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

import { NavGuardProvider } from "@/components/layout/nav-guard-provider";
import { MagneticCursor } from "@/components/ui/magnetic-cursor";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { logWebStartupDiagnostics, resolveAppUrl } from "@/lib/startup-diagnostics";
import { EB_Garamond } from "next/font/google";
import Image from "next/image";
import { Toaster } from "sonner";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-eb-garamond",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#faf8f5",
};

export const metadata: Metadata = {
  title: { default: "Retuned", template: "%s | Retuned" },
  description:
    "Paste a job description. Get a tailored resume, cover letter, and application strategy in under 3 minutes.",
  metadataBase: resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Retuned",
  },
  formatDetection: {
    telephone: false,
  },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`antialiased ${ebGaramond.className}`}>
      <body className="min-h-screen bg-[#faf8f5] text-[#1a1a1a]">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-48 top-24 h-[560px] w-[560px] opacity-[0.18] blur-[0.5px]">
            <Image src="/images/orb.png" alt="" fill className="object-contain" priority unoptimized />
          </div>
          <div className="absolute -right-56 bottom-[-120px] h-[680px] w-[680px] opacity-[0.12]">
            <Image src="/images/orb.png" alt="" fill className="object-contain" unoptimized />
          </div>
        </div>
        <MagneticCursor />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-[#2d8a5e]"
        >
          Skip to main content
        </a>
        <ErrorBoundary>
          <NavGuardProvider>
            <div className="relative z-10 mx-3 my-3 h-[calc(100vh-24px)] rounded-[2rem] border border-[#e0ddd9] bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">{children}</div>
          </NavGuardProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#ffffff",
                border: "1px solid #e5e2dd",
                color: "#1a1a1a",
              },
            }}
          />
        </ErrorBoundary>
      </body>
    </html>
  );
}
