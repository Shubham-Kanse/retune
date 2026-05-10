export const metadata = {
  title: "Privacy Policy — Retuned",
  description: "Learn how Retuned handles your data and privacy.",
};

export default function PrivacyPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-8 text-4xl font-bold">Privacy Policy</h1>

        <p className="mb-6 text-sm text-muted-foreground">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="prose prose-invert space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p>
              Retuned ("Company," "we," "us," "our") is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you use our website and services (the "Service").
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Information We Collect</h2>
            <p>
              We collect information you provide directly and information about your use of our
              Service:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                <strong>Account Information:</strong> Name, email address, phone number, LinkedIn
                profile URL, location, visa status, work history, education, skills, and
                certifications.
              </li>
              <li>
                <strong>Job Application Data:</strong> Job descriptions you provide, generated
                resumes, cover letters, application strategies, and ATS scores.
              </li>
              <li>
                <strong>Usage Data:</strong> Pages visited, time spent on each page, device
                information, IP address, browser type, and clickstream data.
              </li>
              <li>
                <strong>Communication Data:</strong> Email addresses, messages, and content of any
                support requests.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
            <p>We use collected information to:</p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Provide, maintain, and improve the Service</li>
              <li>Generate tailored resumes, cover letters, and application strategies</li>
              <li>
                Send transactional emails (account confirmation, password reset, generation
                notifications)
              </li>
              <li>Monitor and analyze usage trends and Service performance</li>
              <li>Detect, prevent, and address fraud and security issues</li>
              <li>Comply with legal obligations</li>
              <li>Respond to your requests and support inquiries</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide the Service
              and fulfill the purposes outlined in this Privacy Policy. You can request deletion of
              your account and associated data at any time by emailing{" "}
              <a href="mailto:support@retuned.cv" className="text-primary underline">
                support@retuned.cv
              </a>
              .
            </p>
            <p>
              Upon account deletion, we will remove your personal information within 30 days, except
              where we are required to retain it for legal or compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Data Security</h2>
            <p>
              We implement industry-standard security measures, including encryption in transit
              (TLS/SSL), secure password hashing (bcrypt), and httpOnly cookies for session
              management. However, no method of transmission over the internet is 100% secure, and
              we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>
                <strong>Anthropic:</strong> AI model API for generating resumes and cover letters.
              </li>
              <li>
                <strong>Tavily:</strong> Web search API for company research.
              </li>
              <li>
                <strong>Jina Reader:</strong> Web scraping service for extracting job descriptions
                from URLs.
              </li>
            </ul>
            <p>
              These services process your data according to their own privacy policies. We recommend
              reviewing their policies at anthropic.com, tavily.com, and jina.ai.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data at any time.
              Contact us at{" "}
              <a href="mailto:support@retuned.cv" className="text-primary underline">
                support@retuned.cv
              </a>{" "}
              to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Cookies</h2>
            <p>
              We use cookies to maintain your session (httpOnly, secure). These cookies are
              essential for the Service to function and cannot be disabled. We do not use tracking
              cookies or third-party analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. We will notify you of material changes
              by email or by posting the updated policy on this page with an updated "Last updated"
              date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our privacy practices, please
              contact us at:
            </p>
            <p className="mt-4 space-y-1">
              <strong>Retuned</strong>
              <br />
              Email:{" "}
              <a href="mailto:support@retuned.cv" className="text-primary underline">
                support@retuned.cv
              </a>
              <br />
              Address: India
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
