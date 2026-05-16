const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? "noreply@retuned.cv";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    // Dev fallback: log to console
    console.log("[email:dev]", { to, subject, html });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;
  await sendEmail({
    to,
    subject: "Verify your Retuned email",
    html: `
      <div style="font-family:Roboto, Arial, Helvetica, sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:600;margin-bottom:16px">Verify your email</h2>
        <p style="margin-bottom:24px;color:#555">
          Hi ${name}, welcome to Retuned! Click the link below to verify your email address.
          This link expires in 24 hours.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;text-decoration:none;font-weight:500">
          Verify email
        </a>
        <p style="margin-top:24px;font-size:13px;color:#888">
          If you didn't sign up for Retuned, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to,
    subject: "Reset your Retuned password",
    html: `
      <div style="font-family:Roboto, Arial, Helvetica, sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:600;margin-bottom:16px">Reset your password</h2>
        <p style="margin-bottom:24px;color:#555">
          We received a request to reset your Retuned password. Click the link below to set a new password.
          This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;text-decoration:none;font-weight:500">
          Reset password
        </a>
        <p style="margin-top:24px;font-size:13px;color:#888">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendGenerationCompleteEmail(
  to: string,
  companyName: string,
  applicationId: string,
): Promise<void> {
  const appUrl = `${APP_URL}/applications/${applicationId}`;
  await sendEmail({
    to,
    subject: `Your resume is ready - ${companyName}`,
    html: `
      <div style="font-family:Roboto, Arial, Helvetica, sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:600;margin-bottom:16px">Your resume is ready</h2>
        <p style="margin-bottom:24px;color:#555">
          Your tailored application package for <strong>${companyName}</strong> is complete -
          resume, cover letter, ATS score, and application strategy are all ready to download.
        </p>
        <a href="${appUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;text-decoration:none;font-weight:500">
          View results
        </a>
      </div>
    `,
  });
}
