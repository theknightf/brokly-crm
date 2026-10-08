# Brokly Mobile (Flutter)

Native Flutter app connecting to the **same Supabase backend** as the Brokly CRM web app.
This step implements **auth only**: login → placeholder home → logout → back to login.

## Folder structure

```
mobile_flutter/
  lib/
    main.dart                     # Supabase.init + runApp
    core/
      app.dart                    # MaterialApp root
    features/
      auth/
        auth_gate.dart            # decides login vs home based on session
        login_screen.dart         # email + password + error message
        home_screen.dart          # "Logged in as {email}" + logout
```

## Prerequisites

- Flutter SDK (stable) installed and on PATH
- Backend credentials from the web repo's root `.env`:
  - `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://bhdxlmusufwwioghahec.supabase.co`)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, safe to expose)

## Setup

Because Flutter is not installed in this environment, the project source is
provided directly. Generate the platform folders and resolve deps:

```bash
cd mobile_flutter
flutter create .            # adds android/ios/web scaffolding (keeps existing lib/)
flutter pub get
```

## Run

```bash
# From mobile_flutter/
flutter run \
  --dart-define=SUPABASE_URL=https://bhdxlmusufwwioghahec.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<paste anon key from root .env>
```

> Keys are passed at build time via `--dart-define` — never hardcoded, never committed.
> You can also add them to a `--dart-define-from-file=env.json` file for convenience.

## Behavior

- On launch, `supabase_flutter` restores any persisted session. If a session
  exists, the home screen is shown directly (login skipped).
- Login uses the same Supabase Auth (`sign_in_with_password`) as the web app,
  so the same email/password credentials work.
- Logout calls `auth.signOut()` and returns to the login screen.

## Assumptions

1. Auth is email/password via Supabase Auth (same as web app). No OAuth/SMS.
2. The Supabase project URL/anon key are treated as public (safe to embed), and
   the anon key is pulled from the root `.env`, not hardcoded.
3. Session persistence relies on `supabase_flutter`'s built-in local storage.
4. No email-confirmation gating is handled; if the project requires confirmed
   emails, unconfirmed accounts may need confirmation before logging in.
5. Only the auth flow is included in this step — leads/deals/other screens come
   in later steps.
