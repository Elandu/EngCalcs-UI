# EngCalcs UI

SaaS frontend for EngCalcs: projects, engineering calculations, review workflows and reports.

## Stack

- Next.js 16 / React 19 / TypeScript
- Supabase Auth via `@supabase/ssr`
- EngCalcs Python API for calculation discovery and execution

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure a dedicated Supabase project in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
ENGCALCS_API_URL=http://127.0.0.1:8000
```

Do not put a Supabase secret/service-role key in any `NEXT_PUBLIC_` variable.

`ENGCALCS_API_URL` takes precedence; `OPENCALCS_API_URL` is still accepted during migration. The current Render hostname remains `opencalcs-api.onrender.com` until that service is renamed.

## Product boundary

The UI owns the SaaS experience: identity, organisations, projects, saved calculation instances, review states and presentation. Calculation formulae remain in versioned engine packages behind the EngCalcs runtime/API.

The Supabase migration adds `engcalcs_*` RPC aliases while preserving the existing `opencalcs_*` functions. Apply the migration before deploying the renamed Edge Functions; both function-name generations remain available during client rollout.


## Supabase email confirmation

For cookie-based SSR signup, configure the Supabase **Confirm signup** email template to link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Set the project's Site URL and allowed redirect URLs for each deployed environment before enabling production signups.
