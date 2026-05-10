"use client";

import { LegalModal } from "@/components/ui/legal-modal";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { useState } from "react";

export function Footer() {
  const [legalDoc, setLegalDoc] = useState<"terms" | "privacy" | null>(null);

  return (
    <>
      <footer className="border-t border-border">
        <div className="px-8 py-6 md:px-16 lg:px-24 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo variant="full" size="sm" />
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <button
              type="button"
              className="hover:text-foreground transition-colors"
              onClick={() => setLegalDoc("privacy")}
            >
              Privacy
            </button>
            <button
              type="button"
              className="hover:text-foreground transition-colors"
              onClick={() => setLegalDoc("terms")}
            >
              Terms
            </button>
            <Link href="mailto:hello@retuned.cv" className="hover:text-foreground transition-colors">
              Contact
            </Link>
            <span>© {new Date().getFullYear()} Retuned</span>
          </div>
        </div>
      </footer>
      <LegalModal
        isOpen={legalDoc != null}
        doc={legalDoc ?? "terms"}
        onClose={() => setLegalDoc(null)}
      />
    </>
  );
}
