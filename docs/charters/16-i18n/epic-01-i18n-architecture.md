# Epic 01 — i18n Architecture

## Summary

Install `next-intl`, configure locale routing and resolution, create the English message catalogue, extract the login page strings as the first reference implementation, and verify with a test that locale switching renders translated content.

## Stories

---

### Story 1: Install and Configure next-intl

**As a** developer  
**I want** `next-intl` installed and configured in `apps/web`  
**So that** I have the infrastructure to localise any component  

#### Acceptance Criteria

- [ ] `next-intl` is listed in `apps/web/package.json` dependencies
- [ ] `apps/web/src/i18n/routing.ts` exports supported locales `['en', 'fr', 'de', 'es']` with default `'en'`
- [ ] `apps/web/src/i18n/request.ts` resolves locale from user's `locale` column or `Accept-Language` header
- [ ] `apps/web/next.config.ts` includes the `next-intl` plugin
- [ ] `apps/web/src/middleware.ts` handles locale routing via `next-intl`
- [ ] App compiles without errors after configuration

#### Tasks

**Task 1.1: Install next-intl**  
Command: `pnpm --filter @retune/web add next-intl`  
Effort: 5 minutes

**Task 1.2: Create routing configuration**  
File: `apps/web/src/i18n/routing.ts`  
Effort: 15 minutes

```typescript
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'de', 'es'],
  defaultLocale: 'en',
});
```

**Task 1.3: Create request-time locale resolution**  
File: `apps/web/src/i18n/request.ts`  
Effort: 30 minutes

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

**Task 1.4: Update next.config.ts**  
File: `apps/web/next.config.ts`  
Effort: 15 minutes

Add the next-intl plugin:

```typescript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Wrap existing config
export default withNextIntl(nextConfig);
```

**Task 1.5: Update middleware for locale routing**  
File: `apps/web/src/middleware.ts`  
Effort: 30 minutes

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Integrate with existing middleware chain
// Apply intlMiddleware for public routes, preserve existing auth logic
```

---

### Story 2: Create English Message Catalogue

**As a** developer  
**I want** an English message catalogue with login page strings  
**So that** the login page can be rendered from the catalogue instead of hardcoded strings  

#### Acceptance Criteria

- [ ] `apps/web/src/i18n/messages/en.json` exists with the following keys:
  - `auth.login.title` = `"Welcome back."`
  - `auth.login.subtitle` = `"Sign in to continue your application workflow."`
  - `auth.login.email` = `"Email"`
  - `auth.login.password` = `"Password"`
  - `auth.login.forgotPassword` = `"Forgot password?"`
  - `auth.login.submit` = `"Sign in"`
  - `auth.login.submitting` = `"Signing in…"`
  - `auth.login.noAccount` = `"New here?"`
  - `auth.login.createAccount` = `"Create an account"`
  - `auth.login.emailVerified` = `"Email verified successfully. You can now sign in."`
- [ ] JSON is valid and parseable
- [ ] Nested structure uses dot-notation grouping: `{ "auth": { "login": { ... } } }`

#### Tasks

**Task 2.1: Create English message file**  
File: `apps/web/src/i18n/messages/en.json`  
Effort: 15 minutes

```json
{
  "auth": {
    "login": {
      "title": "Welcome back.",
      "subtitle": "Sign in to continue your application workflow.",
      "email": "Email",
      "password": "Password",
      "forgotPassword": "Forgot password?",
      "submit": "Sign in",
      "submitting": "Signing in…",
      "noAccount": "New here?",
      "createAccount": "Create an account",
      "emailVerified": "Email verified successfully. You can now sign in."
    }
  }
}
```

**Task 2.2: Create French message file (stub)**  
File: `apps/web/src/i18n/messages/fr.json`  
Effort: 15 minutes

```json
{
  "auth": {
    "login": {
      "title": "Bon retour.",
      "subtitle": "Connectez-vous pour continuer votre processus de candidature.",
      "email": "E-mail",
      "password": "Mot de passe",
      "forgotPassword": "Mot de passe oublié ?",
      "submit": "Se connecter",
      "submitting": "Connexion en cours…",
      "noAccount": "Nouveau ici ?",
      "createAccount": "Créer un compte",
      "emailVerified": "E-mail vérifié avec succès. Vous pouvez maintenant vous connecter."
    }
  }
}
```

**Task 2.3: Create German message file (stub)**  
File: `apps/web/src/i18n/messages/de.json`  
Effort: 15 minutes

```json
{
  "auth": {
    "login": {
      "title": "Willkommen zurück.",
      "subtitle": "Melden Sie sich an, um Ihren Bewerbungsprozess fortzusetzen.",
      "email": "E-Mail",
      "password": "Passwort",
      "forgotPassword": "Passwort vergessen?",
      "submit": "Anmelden",
      "submitting": "Anmeldung läuft…",
      "noAccount": "Neu hier?",
      "createAccount": "Konto erstellen",
      "emailVerified": "E-Mail erfolgreich verifiziert. Sie können sich jetzt anmelden."
    }
  }
}
```

**Task 2.4: Create Spanish message file (stub)**  
File: `apps/web/src/i18n/messages/es.json`  
Effort: 15 minutes

```json
{
  "auth": {
    "login": {
      "title": "Bienvenido de nuevo.",
      "subtitle": "Inicia sesión para continuar tu proceso de solicitud.",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "forgotPassword": "¿Olvidaste tu contraseña?",
      "submit": "Iniciar sesión",
      "submitting": "Iniciando sesión…",
      "noAccount": "¿Eres nuevo?",
      "createAccount": "Crear una cuenta",
      "emailVerified": "Correo electrónico verificado correctamente. Ya puedes iniciar sesión."
    }
  }
}
```

---

### Story 3: Extract Login Page Strings

**As a** user visiting the login page  
**I want** the page to display in my preferred language  
**So that** I can understand the interface without knowing English  

#### Acceptance Criteria

- [ ] `apps/web/src/app/(public)/login/page.tsx` uses `useTranslations('auth.login')` instead of hardcoded strings
- [ ] All 10 specified strings are replaced with `t('title')`, `t('subtitle')`, etc.
- [ ] Login page renders identically in English (no visual regression)
- [ ] Login page renders French strings when locale is `'fr'`

#### Tasks

**Task 3.1: Update login page to use translations**  
File: `apps/web/src/app/(public)/login/page.tsx`  
Effort: 1 hour

Replace hardcoded strings:

```typescript
import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const t = useTranslations('auth.login');

  return (
    // ...existing JSX with replacements:
    // 'Welcome back.' → t('title')
    // 'Sign in to continue your application workflow.' → t('subtitle')
    // 'Email' → t('email')
    // 'Password' → t('password')
    // 'Forgot password?' → t('forgotPassword')
    // 'Sign in' → t('submit')
    // 'Signing in…' → t('submitting')
    // 'New here?' → t('noAccount')
    // 'Create an account' → t('createAccount')
    // 'Email verified successfully. You can now sign in.' → t('emailVerified')
  );
}
```

**Task 3.2: Verify no hardcoded English remains in login page**  
Effort: 15 minutes

Grep the file for any of the 10 original English strings to confirm they are all replaced.

---

### Story 4: Write Locale Switching Test

**As a** developer  
**I want** a test proving the login page renders French strings when locale is `'fr'`  
**So that** I have confidence the i18n pipeline works end-to-end  

#### Acceptance Criteria

- [ ] Test renders login page with `locale='fr'`
- [ ] Test asserts `"Bon retour."` is visible (French title)
- [ ] Test asserts `"Se connecter"` is visible (French submit button)
- [ ] Test asserts `"Welcome back."` is NOT visible (English title absent)
- [ ] Test passes in CI

#### Tasks

**Task 4.1: Write vitest test for locale rendering**  
File: `apps/web/src/__tests__/login-i18n.test.tsx`  
Effort: 1.5 hours

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LoginPage from '../app/(public)/login/page';
import frMessages from '../i18n/messages/fr.json';
import enMessages from '../i18n/messages/en.json';

describe('Login page i18n', () => {
  it('renders French strings when locale is fr', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <LoginPage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Bon retour.')).toBeDefined();
    expect(screen.getByText('Connectez-vous pour continuer votre processus de candidature.')).toBeDefined();
    expect(screen.getByText('E-mail')).toBeDefined();
    expect(screen.getByText('Mot de passe')).toBeDefined();
    expect(screen.getByText('Mot de passe oublié ?')).toBeDefined();
    expect(screen.getByText('Se connecter')).toBeDefined();
    expect(screen.getByText('Nouveau ici ?')).toBeDefined();
    expect(screen.getByText('Créer un compte')).toBeDefined();
  });

  it('does not show English strings when locale is fr', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        <LoginPage />
      </NextIntlClientProvider>
    );

    expect(screen.queryByText('Welcome back.')).toBeNull();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('renders English strings when locale is en', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <LoginPage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Welcome back.')).toBeDefined();
    expect(screen.getByText('Sign in to continue your application workflow.')).toBeDefined();
    expect(screen.getByText('Sign in')).toBeDefined();
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Install and Configure next-intl | 1.5 hours |
| Story 2: Create English Message Catalogue | 1 hour |
| Story 3: Extract Login Page Strings | 1.25 hours |
| Story 4: Locale Switching Test | 1.5 hours |
| **Total** | **~5.25 hours** |

## Dependencies

- `apps/web` must be on Next.js 13+ App Router (confirmed: Next.js 15)
- `users.locale` column must be readable from session context

## Risks

- Middleware ordering: `next-intl` middleware must compose with existing auth middleware without conflicts
- Server Components: `useTranslations` requires client component boundary or `getTranslations` for server components — login page must be checked
- Bundle size: each locale JSON adds ~1–2KB; acceptable for 4 locales
