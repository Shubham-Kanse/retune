"use client";
import { useState } from "react";
import { LegalModal } from "./legal-modal";

export function LegalLinks({
  className = "text-xs text-white/40 hover:text-white/70 transition-colors",
  wrapperClassName = "flex gap-6",
}: {
  className?: string;
  wrapperClassName?: string;
}) {
  const [doc, setDoc] = useState<"privacy" | "terms" | null>(null);
  return (
    <>
      <div className={wrapperClassName}>
        <button type="button" className={className} onClick={() => setDoc("privacy")}>Privacy</button>
        <button type="button" className={className} onClick={() => setDoc("terms")}>Terms</button>
      </div>
      {doc && <LegalModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

export function LegalLinksBlock({
  linkClassName = "text-sm text-white/70 hover:text-white transition-colors block",
}: {
  linkClassName?: string;
}) {
  const [doc, setDoc] = useState<"privacy" | "terms" | null>(null);
  return (
    <>
      <div className="space-y-3">
        <button type="button" className={linkClassName} onClick={() => setDoc("privacy")}>Privacy Policy</button>
        <button type="button" className={linkClassName} onClick={() => setDoc("terms")}>Terms of Service</button>
      </div>
      {doc && <LegalModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
