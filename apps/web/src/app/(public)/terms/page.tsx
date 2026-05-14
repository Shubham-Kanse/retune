export const metadata = {
  title: "Terms of Service — Retuned",
  description: "Retuned's terms and conditions for using our service.",
};

export default function TermsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-8 text-4xl font-semibold tracking-tight">Terms of Service</h1>

        <p className="mb-6 text-sm text-muted-foreground">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold">1. Agreement to Terms</h2>
            <p>
              By accessing and using the Retuned service ("Service"), you agree to be bound by these
              Terms of Service. If you do not agree to abide by the above, please do not use this
              service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Use License</h2>
            <p>
              Permission is granted to temporarily download one copy of the materials (information
              or software) on Retuned for personal, non-commercial transitory viewing only. This is
              the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>
                Attempting to decompile or reverse engineer any software contained on the Service
              </li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>
                Transferring the materials to another person or "mirroring" the materials on any
                other server
              </li>
              <li>Using the Service to generate content for commercial sale or distribution</li>
              <li>Automating access to the Service via bots or scrapers</li>
              <li>Attempting to gain unauthorized access to the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Disclaimer</h2>
            <p>
              The materials on Retuned are provided on an "as is" basis. Retuned makes no
              warranties, expressed or implied, and hereby disclaims and negates all other
              warranties including, without limitation, implied warranties or conditions of
              merchantability, fitness for a particular purpose, or non-infringement of intellectual
              property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Content Accuracy</h2>
            <p>
              While Retuned strives to generate high-quality, accurate resumes and cover letters
              based on the information you provide, we cannot guarantee that all generated content
              will be perfect or result in job interviews or offers. The Service is a tool to assist
              your job search, not a guarantee of employment success.
            </p>
            <p>
              You are solely responsible for reviewing all generated content before submission to
              employers. You agree to indemnify Retuned against any claims arising from inaccurate
              information you provide or content you submit without proper review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Limitations of Liability</h2>
            <p>
              In no event shall Retuned or its suppliers be liable for any damages (including,
              without limitation, damages for loss of data or profit, or due to business
              interruption) arising out of the use or inability to use the materials on Retuned,
              even if Retuned or an authorized representative has been notified orally or in writing
              of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Accuracy of Materials</h2>
            <p>
              The materials appearing on Retuned could include technical, typographical, or
              photographic errors. Retuned does not warrant that any of the materials on the Service
              are accurate, complete, or current. Retuned may make changes to the materials
              contained on the Service at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Materials and Content Ownership</h2>
            <p>
              <strong>Your Content:</strong> You retain ownership of all content you provide to
              Retuned (resumes, job descriptions, profile information). By using Retuned, you grant
              us a non-exclusive, worldwide, royalty-free license to use, copy, modify, and display
              your content solely for the purpose of providing the Service and improving our
              algorithms.
            </p>
            <p>
              <strong>Generated Content:</strong> Resumes and cover letters generated by Retuned are
              created based on your input and are your property. You may use, modify, and distribute
              them as you see fit.
            </p>
            <p>
              <strong>Our Content:</strong> All code, design, copy, and other original materials on
              Retuned are the property of Retuned and protected by copyright. You may not reproduce,
              distribute, or transmit any content without our prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Revisions and Errors</h2>
            <p>
              Retuned may make changes to the Service and to the materials described therein at any
              time without notice. Retuned does not, however, make any commitment to update the
              materials.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Links</h2>
            <p>
              Retuned has not reviewed all of the sites linked to its website and is not responsible
              for the contents of any such linked site. The inclusion of any link does not imply
              endorsement by Retuned of the site. Use of any such linked website is at the user's
              own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Modifications</h2>
            <p>
              Retuned may revise these terms and conditions for its website at any time without
              notice. By using this website, you are agreeing to be bound by the then current
              version of these terms and conditions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Governing Law</h2>
            <p>
              These terms and conditions are governed by and construed in accordance with the laws
              of India, and you irrevocably submit to the exclusive jurisdiction of the courts in
              India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">12. Subscription and Billing</h2>
            <p>
              <strong>Free Plan:</strong> Includes a $5.00 credit balance and up to 5 refinements
              per application.
            </p>
            <p>
              <strong>Pro Plan:</strong> Includes a larger monthly credit allowance for generations
              and refinements. Billing is monthly or annual. You may cancel your subscription at any
              time, and your access will end at the end of the billing period.
            </p>
            <p>
              We reserve the right to change pricing with 30 days' notice. Existing subscriptions
              are not affected by price changes until renewal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">13. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-inside list-disc space-y-2 pl-4">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on the rights of others</li>
              <li>
                Harass, abuse, insult, harm, defame, slander, disparage, or intimidate any person
              </li>
              <li>Submit false or misleading information</li>
              <li>
                Reverse engineer, decompile, or otherwise attempt to discover the source code of the
                Service
              </li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Use the Service to spam or engage in mass unsolicited communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">14. Termination</h2>
            <p>
              We reserve the right to terminate or suspend your account immediately, without prior
              notice or liability, for any reason whatsoever, including if you breach the Terms of
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">15. Contact Information</h2>
            <p>If you have any questions about these Terms of Service, please contact us at:</p>
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
