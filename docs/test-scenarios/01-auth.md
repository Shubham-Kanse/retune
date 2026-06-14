# TS-AUTH — Authentication & Session

---

## Happy Path

### TS-AUTH-001 · P0 · [COVERED]
**Signup with email + password**
- User visits `/signup`, fills name/email/password, submits
- Expected: account created, redirected to `/onboarding-v2`
- Verify: session cookie set, user row in DB

### TS-AUTH-002 · P0 · [COVERED]
**Login with correct credentials**
- User visits `/login`, fills email/password, submits
- Expected: redirected to `/dashboard`
- Verify: session cookie refreshed

### TS-AUTH-003 · P0 · [COVERED]
**Logout clears session**
- Authenticated user clicks "Sign out"
- Expected: session cookie cleared, redirected to `/`
- Verify: subsequent request to `/dashboard` redirects to `/login`

### TS-AUTH-004 · P1 · [COVERED]
**Session survives page refresh**
- Authenticated user refreshes `/dashboard`
- Expected: stays on `/dashboard`, no re-login required

### TS-AUTH-005 · P1 · [MISSING]
**Password reset — happy path**
- User visits `/forgot-password`, enters email, submits
- Expected: success message shown, reset email sent
- User clicks link in email, visits `/reset-password?token=...`
- Fills new password, submits
- Expected: redirected to `/login`, can log in with new password

### TS-AUTH-006 · P1 · [MISSING]
**Google OAuth signup**
- User clicks "Continue with Google" on `/signup`
- Expected: OAuth flow completes, account created, redirected to `/onboarding-v2`

### TS-AUTH-007 · P1 · [MISSING]
**Google OAuth login (existing account)**
- User with existing Google-linked account clicks "Continue with Google" on `/login`
- Expected: redirected to `/dashboard`

---

## Negative Tests

### TS-AUTH-008 · P0 · [MISSING]
**Signup with already-registered email**
- User submits signup form with an email that already has an account
- Expected: inline error "An account with this email already exists"
- Form stays populated, no redirect

### TS-AUTH-009 · P0 · [MISSING]
**Login with wrong password**
- User submits login form with correct email, wrong password
- Expected: inline error "Incorrect email or password"
- No account lockout on first attempt

### TS-AUTH-010 · P0 · [MISSING]
**Login with non-existent email**
- User submits login form with email that has no account
- Expected: same generic error as wrong password (no user enumeration)

### TS-AUTH-011 · P1 · [MISSING]
**Signup with weak password**
- User submits signup with password "123"
- Expected: inline validation error before submission
- Password field highlighted

### TS-AUTH-012 · P1 · [MISSING]
**Signup with invalid email format**
- User submits signup with "notanemail"
- Expected: inline validation error "Enter a valid email address"

### TS-AUTH-013 · P1 · [MISSING]
**Password reset with unknown email**
- User submits `/forgot-password` with email not in system
- Expected: same success message as valid email (no user enumeration)

### TS-AUTH-014 · P1 · [MISSING]
**Password reset token expired**
- User clicks a reset link older than 1 hour
- Expected: error page "This link has expired. Request a new one."
- CTA to `/forgot-password`

### TS-AUTH-015 · P1 · [MISSING]
**Password reset token already used**
- User clicks a reset link that was already consumed
- Expected: error "This link has already been used."

### TS-AUTH-016 · P2 · [MISSING]
**Signup with SQL injection in name field**
- User submits name: `'; DROP TABLE users; --`
- Expected: account created with literal string as name, no DB error

### TS-AUTH-017 · P2 · [MISSING]
**Signup with XSS in name field**
- User submits name: `<script>alert(1)</script>`
- Expected: stored and displayed as escaped text, no script execution

---

## Session Edge Cases

### TS-AUTH-018 · P0 · [COVERED]
**Unauthenticated access to protected route**
- Unauthenticated user visits `/dashboard`
- Expected: redirected to `/login`

### TS-AUTH-019 · P0 · [COVERED]
**Authenticated user visiting auth pages**
- Logged-in user visits `/login` or `/signup`
- Expected: redirected to `/dashboard`

### TS-AUTH-020 · P1 · [MISSING]
**Session cookie tampered**
- User modifies session cookie value in browser
- Expected: treated as unauthenticated, redirected to `/login`

### TS-AUTH-021 · P1 · [MISSING]
**Concurrent sessions on multiple devices**
- User logs in on device A and device B simultaneously
- Expected: both sessions valid independently
- Logout on device A does not affect device B

### TS-AUTH-022 · P2 · [MISSING]
**Session after account deletion**
- User deletes account while logged in on another tab
- Expected: next request on other tab returns 401, redirected to `/login`

---

## Rate Limiting

### TS-AUTH-023 · P1 · [MISSING]
**Login rate limit**
- User submits login form 10+ times in rapid succession with wrong password
- Expected: rate limit response after threshold, "Too many attempts. Try again in X minutes."

### TS-AUTH-024 · P1 · [MISSING]
**Signup rate limit**
- Same IP creates 5+ accounts in rapid succession
- Expected: rate limit response

### TS-AUTH-025 · P2 · [MISSING]
**Password reset rate limit**
- Same email requests reset 5+ times in rapid succession
- Expected: rate limit, no additional emails sent
