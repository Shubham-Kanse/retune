# Auth & Database Wiring

## Architecture

The application uses **two separate user tables**:

1. **`auth.users`** - Supabase's built-in authentication table
   - Managed by Supabase Auth
   - Handles OAuth, email/password, sessions
   - Primary key: UUID (auto-generated)

2. **`public.users`** - Application's user profile table
   - Managed by application code
   - Stores onboarding state, preferences, metadata
   - Primary key: UUID (must match `auth.users.id`)
   - **Why separate?** All application tables (profiles, generations, applications, etc.) have foreign keys to `public.users.id`. This allows storing app-specific data (onboarding state, persona type, market preferences) that doesn't belong in Supabase's auth table.

## Synchronization

### User Creation
- **Trigger**: `on_auth_user_created` (migration: `20260511165300`)
- **When**: After INSERT on `auth.users`
- **Action**: Auto-creates matching `public.users` row with same UUID

### User Deletion
- **Trigger**: `on_auth_user_deleted` (migration: `20260511165200`)
- **When**: After DELETE on `auth.users`
- **Action**: Cascade deletes from `public.users` (which cascades to all related tables)

### Auth Provider Change
- **Trigger**: `on_auth_provider_change` (migration: `20260511165400`)
- **When**: Before UPDATE on `public.users` when `auth_provider` changes
- **Action**: Resets `onboarding_completed` if it was never truly completed (no `onboarding_completed_at` timestamp)

## Onboarding Columns

The schema has **two onboarding columns** for compatibility:

- `onboarding_complete` (BOOLEAN) - Base schema column
- `onboarding_completed` (BOOLEAN) - Application code expects this
- **Sync trigger**: `users_sync_onboarding_flags` keeps them in sync

Application code should use `onboardingCompleted` (Drizzle schema maps to `onboarding_completed`).

## OAuth Flow (Google)

1. User clicks "Sign in with Google"
2. Supabase Auth creates/updates `auth.users` row
3. Callback handler (`apps/web/src/app/api/auth/google/callback/route.ts`):
   - Checks if `public.users` exists by UUID (from `auth.users.id`)
   - If not found, checks by email (account merge case)
   - If found by email:
     - Updates `auth_provider` to 'google'
     - Trigger resets onboarding if needed
     - Checks `onboarding_completed` and redirects accordingly
   - If brand new user:
     - Creates `public.users` with `onboarding_completed: false`
     - Redirects to `/onboarding`

## Testing User Deletion

When testing by deleting a user from Supabase auth dashboard:

1. Delete from `auth.users` → trigger deletes from `public.users`
2. All related data (profiles, applications, etc.) cascade delete
3. Next login creates fresh user with `onboarding_completed: false`

## Common Issues

### Issue: User goes to dashboard instead of onboarding after re-login
**Cause**: Old `public.users` row persisted with `onboarding_completed: true`
**Fix**: Cascade delete trigger now handles this

### Issue: Onboarding state mismatch between auth methods
**Cause**: Auth provider changed but onboarding flag wasn't reset
**Fix**: `on_auth_provider_change` trigger resets flag when appropriate
