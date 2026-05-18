/**
 * Retune email templates for Supabase Auth.
 *
 * Supabase template variables:
 *   {{ .ConfirmationURL }}  — confirm signup, invite, magic link, email change
 *   {{ .Token }}            — OTP code (6-digit)
 *   {{ .SiteURL }}          — your app URL
 *
 * Paste the `html` value of each export into the corresponding
 * Supabase Auth → Email Templates editor.
 */

const baseLayout = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Retune</title>
</head>
<body style="margin:0;padding:0;background-color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#171717;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:40px;">
          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:20px;font-weight:700;color:#fafafa;letter-spacing:-0.5px;">retune</span>
            </td>
          </tr>
          <!-- Content -->
          ${content}
          <!-- Footer -->
          <tr>
            <td style="padding-top:32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#737373;line-height:1.5;">
                This email was sent by Retune. If you didn't expect this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const button = (url: string, label: string) => `
<a href="${url}" style="display:inline-block;background-color:#fafafa;color:#171717;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
  ${label}
</a>`;

// ─── 1. Confirm Sign Up ─────────────────────────────────────────────────────

export const confirmSignUp = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Confirm your email</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        Thanks for signing up for Retune. Click the button below to verify your email address and activate your account.
      </p>
      ${button("{{ .ConfirmationURL }}", "Verify email")}
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">
        Or copy this link: <a href="{{ .ConfirmationURL }}" style="color:#a3a3a3;word-break:break-all;">{{ .ConfirmationURL }}</a>
      </p>
    </td>
  </tr>
`);

// ─── 2. Invite User ─────────────────────────────────────────────────────────

export const inviteUser = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">You've been invited</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        You've been invited to join Retune — the AI-powered platform that crafts tailored resumes and cover letters. Click below to accept and create your account.
      </p>
      ${button("{{ .ConfirmationURL }}", "Accept invite")}
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">
        Or copy this link: <a href="{{ .ConfirmationURL }}" style="color:#a3a3a3;word-break:break-all;">{{ .ConfirmationURL }}</a>
      </p>
    </td>
  </tr>
`);

// ─── 3. Magic Link ──────────────────────────────────────────────────────────

export const magicLink = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Sign in to Retune</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        Click the button below to sign in. This link expires in 10 minutes and can only be used once.
      </p>
      ${button("{{ .ConfirmationURL }}", "Sign in")}
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">
        Or copy this link: <a href="{{ .ConfirmationURL }}" style="color:#a3a3a3;word-break:break-all;">{{ .ConfirmationURL }}</a>
      </p>
    </td>
  </tr>
`);

// ─── 4. Change Email Address ────────────────────────────────────────────────

export const changeEmail = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Confirm email change</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        You requested to change your email address on Retune. Click below to confirm this change.
      </p>
      ${button("{{ .ConfirmationURL }}", "Confirm new email")}
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">
        If you didn't request this change, your account may be compromised. Please reset your password immediately.
      </p>
    </td>
  </tr>
`);

// ─── 5. Reset Password ──────────────────────────────────────────────────────

export const resetPassword = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        We received a request to reset your Retune password. Click below to choose a new one. This link expires in 1 hour.
      </p>
      ${button("{{ .ConfirmationURL }}", "Reset password")}
      <p style="margin:24px 0 0;font-size:12px;color:#737373;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    </td>
  </tr>
`);

// ─── 6. Reauthentication ────────────────────────────────────────────────────

export const reauthentication = baseLayout(`
  <tr>
    <td>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#fafafa;">Verify it's you</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#a3a3a3;line-height:1.6;">
        To complete this sensitive action, enter the verification code below:
      </p>
      <div style="margin:24px 0;padding:16px 24px;background-color:#262626;border:1px solid #2a2a2a;border-radius:8px;text-align:center;">
        <span style="font-size:32px;font-weight:700;color:#fafafa;letter-spacing:6px;">{{ .Token }}</span>
      </div>
      <p style="margin:0;font-size:12px;color:#737373;">
        This code expires in 5 minutes. If you didn't initiate this action, please secure your account immediately.
      </p>
    </td>
  </tr>
`);
