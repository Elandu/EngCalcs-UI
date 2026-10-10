# EngCalcs identity and editorial standards

## Positioning

**Brand statement:** Engineering calculations in context.

**Product statement:** EngCalcs brings engineering inputs, deterministic calculation modules, linked work and review history into one workspace. An AI coordination layer is in development to interpret project information and manage calculation dependencies.

**Audience:** Australian consulting structural engineers first; multidisciplinary engineering teams as the platform expands.

**Do not imply:** Automated code compliance across all standards; that a model independently approves engineering results; production-ready drawing interpretation or revision propagation; proven customer outcomes or measured efficiency improvements without evidence.

## Brand assets

- `/public/brand/engcalcs-mark.svg`: primary vector mark, dark evergreen background with paper-white and brass pathways.
- `/public/brand/engcalcs-mark-mono.svg`: monochrome reproduction when full colour is unavailable.
- `/app/icon.svg`: favicon and app icon, using identical mark geometry.
- `/components/brand.tsx`: shared on-page brand lockup; preserve the geometry and proportions rather than building a separate mark in individual screens.
- `/app/opengraph-image.tsx`: server-rendered 1200×630 PNG for link sharing.

Clear space: at least a quarter of the symbol width on each side. Do not rotate, stretch, use a gradient, add glass/shadow effects or redraw it with an unrelated stroke weight. For small sizes, use the symbol alone. On documents or diagrams, keep the symbol plus "EngCalcs" wordmark.

## Brand palette

| Token | Hex | Use |
| --- | --- | --- |
| Evergreen | `#19382F` | Logo background, core navigation, dark sections, primary buttons |
| Paper | `#F6F4ED` | Main backgrounds |
| Off-white | `#FFFDFA` | Drawing and calculation surfaces |
| Graphite | `#273830` | Main text |
| Copper | `#C47A56` | Sparing annotations, arrows and highlights |
| Brass | `#D5AC71` | Accent within logo; labels on dark backgrounds |
| Grid | `#D5DED6` | Borders, engineering guide lines |
| Muted evergreen | `#596D60` | Supporting text |

Avoid neon green, saturated stock Tailwind colours, pseudo-industrial textures and decorative AI glows. Colour must encode information, not act as ornament.

## Typography

- Primary UI and editorial copy: **IBM Plex Sans**, weights 400–700.
- Standards references, dimensions, calculation IDs, table values and technical labels: **IBM Plex Mono**, weights 400–600.
- An optional restrained serif for editorial emphasis only, not input fields or engineering results.
- Fallbacks are provided. Fonts are loaded through an external stylesheet; do not copy or commit third-party font binaries without checking their licences.

## Product/UI consistency

The landing page, sign-in, dashboard and calculation workbenches share the mark, palette and fonts. Marketing-specific editorial styles live in `landing.css` and `landing-v2.css`. Shared tokens are in `brand-system.css`. Do not modify calculation behaviour when making design changes.

Use real engineering content for product illustrations. The landing hero is generated from `SAMPLE_FRAME_INPUTS` used by the PyNite frame workbench. Its 6 m member and -2 kN/m distributed dead load are input data, **not** a calculated capacity, a saved user project or evidence of completed compliance checking. Label this distinction clearly. Future product screenshots must be captured from the actual application and scrubbed of client information.

## Web and marketing

- The customer-facing home page explains the problem, available capabilities and AI roadmap.
- `/company` holds the startup and business-model explanation, without inventing metrics.
- Use the shared Open Graph image and favicon; avoid duplicate Next.js/Vercel templates or metadata.
- No public "open-source" positioning. Repository visibility and historic software licensing are separate legal/distribution decisions, not controlled by this brand guide.

## Documents and PDF export direction

For new branded engineering calculation packs, use a quiet EngCalcs masthead, project reference, engineer/reviewer field, calculation module and version, inputs and result, revision and provenance, and a clearly identified assumption/warning section. Use real run data; never decorate a report with AI conclusions unsupported by the calculation engine.

Report generation is a separate backend concern and **must not be represented as rebranded merely because the front end changed**. Audit the actual PDF generation path before changing the issued-document layout.

## Accessibility and technical QA

Prefer solid backgrounds, appropriate text contrast, focus-visible styles and no animation essential for comprehension. Verify small-screen input and result views after design token changes. Before release run `npm test`, `npm run lint`, `npm run build`, and review a Vercel preview.
