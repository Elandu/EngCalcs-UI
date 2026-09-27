# OpenCalcs UI

SaaS frontend for OpenCalcs: projects, engineering calculations, review workflows and reports.

## Stack

- Next.js 16 / React 19 / TypeScript
- Supabase Auth via `@supabase/ssr`
- OpenCalcs Python API for calculation discovery and execution

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
OPENCALCS_API_URL=http://127.0.0.1:8000
```

Do not put a Supabase secret/service-role key in any `NEXT_PUBLIC_` variable.

## Product boundary

The UI owns the SaaS experience: identity, organisations, projects, saved calculation instances, review states and presentation. Calculation formulae remain in versioned engine packages behind the OpenCalcs runtime/API.


## Supabase email confirmation

For cookie-based SSR signup, configure the Supabase **Confirm signup** email template to link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Set the project's Site URL and allowed redirect URLs for each deployed environment before enabling production signups.
