"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

const PRIVACY_CONTENT = (
  <div className="space-y-6 text-sm leading-relaxed text-[#1a1a1a]">
    <section>
      <h2 className="text-base font-semibold mb-2">1. Introduction</h2>
      <p>Retuned ("Company," "we," "us," "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">2. Information We Collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Account Information:</strong> Name, email, phone, LinkedIn, location, visa status, work history, education, skills.</li>
        <li><strong>Job Application Data:</strong> Job descriptions, generated resumes, cover letters, ATS scores.</li>
        <li><strong>Usage Data:</strong> Pages visited, device info, IP address, browser type.</li>
      </ul>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">3. How We Use Your Information</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Provide, maintain, and improve the Service</li>
        <li>Generate tailored resumes, cover letters, and application strategies</li>
        <li>Send transactional emails (account confirmation, password reset)</li>
        <li>Detect, prevent, and address fraud and security issues</li>
      </ul>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">4. Data Retention</h2>
      <p>We retain your data as long as necessary to provide the Service. You can request deletion at any time by emailing <a href="mailto:support@retuned.cv" className="underline">support@retuned.cv</a>. Deletion is processed within 30 days.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">5. Data Security</h2>
      <p>We use TLS/SSL encryption, bcrypt password hashing, and httpOnly cookies. No method of transmission is 100% secure.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">6. Third-Party Services</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Anthropic:</strong> AI model API for generating content.</li>
        <li><strong>Tavily:</strong> Web search for company research.</li>
        <li><strong>Jina Reader:</strong> Job description extraction from URLs.</li>
      </ul>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">7. Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal data. We do not sell your personal information. Contact <a href="mailto:support@retuned.cv" className="underline">support@retuned.cv</a>.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">8. Contact</h2>
      <p>Retuned · <a href="mailto:support@retuned.cv" className="underline">support@retuned.cv</a> · India</p>
    </section>
  </div>
);

const TERMS_CONTENT = (
  <div className="space-y-6 text-sm leading-relaxed text-[#1a1a1a]">
    <section>
      <h2 className="text-base font-semibold mb-2">1. Agreement to Terms</h2>
      <p>By using Retuned, you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">2. Use License</h2>
      <p>You may use the Service for personal, non-commercial purposes only. You may not: copy or modify materials, use them commercially, reverse engineer the software, automate access via bots, or use the Service to generate content for sale.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">3. Content Accuracy</h2>
      <p>Retuned generates content based on your input but cannot guarantee results. You are solely responsible for reviewing all generated content before submission to employers.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">4. Content Ownership</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Your Content:</strong> You retain ownership of all content you provide.</li>
        <li><strong>Generated Content:</strong> Resumes and cover letters generated are your property.</li>
        <li><strong>Our Content:</strong> All code, design, and copy are property of Retuned.</li>
      </ul>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">5. Subscription & Billing</h2>
      <p><strong>Free Plan:</strong> $5.00 credit, up to 5 refinements per application. <strong>Pro Plan:</strong> Larger monthly credit allowance. Cancel anytime; access ends at period end. Pricing changes given 30 days' notice.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">6. Prohibited Activities</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Violating applicable laws or regulations</li>
        <li>Submitting false or misleading information</li>
        <li>Attempting unauthorised access to the Service</li>
        <li>Using the Service to spam or engage in mass unsolicited communications</li>
      </ul>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">7. Termination</h2>
      <p>We reserve the right to terminate or suspend your account immediately for any breach of these Terms.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">8. Governing Law</h2>
      <p>These terms are governed by the laws of India.</p>
    </section>
    <section>
      <h2 className="text-base font-semibold mb-2">9. Contact</h2>
      <p>Retuned · <a href="mailto:support@retuned.cv" className="underline">support@retuned.cv</a> · India</p>
    </section>
  </div>
);

export function LegalModal({
  doc,
  onClose,
  isOpen = true,
}: {
  doc: "privacy" | "terms";
  onClose: () => void;
  /** When false, the modal is not rendered. Defaults to true for callers that
   *  conditionally mount the component. */
  isOpen?: boolean;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#1a1a1a]/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[80vh] bg-white border border-[#e5e2dd] rounded-2xl flex flex-col shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e2dd] shrink-0">
          <h2 className="font-serif text-xl text-[#1a1a1a]">
            {doc === "privacy" ? "Privacy Policy" : "Terms of Service"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          {doc === "privacy" ? PRIVACY_CONTENT : TERMS_CONTENT}
        </div>
      </div>
    </div>
  );
}
