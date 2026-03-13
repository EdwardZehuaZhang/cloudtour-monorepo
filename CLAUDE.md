# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `progress.txt`

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good CLAUDE.md additions:**
- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- ALL commits must pass your project's quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Browser Testing (If Available)

For any story that changes UI, verify it works in the browser if you have browser testing tools configured (e.g., via MCP):

1. Navigate to the relevant page
2. Verify the UI changes work as expected
3. Take a screenshot if helpful for the progress log

If no browser tools are available, note in your progress report that manual browser verification is needed.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting

---

# CloudTour Monorepo

## 1. Project Overview

CloudTour is a full-stack Gaussian splatting virtual tour SaaS platform. Users create immersive 3D tours using Gaussian splat files (.ply, .splat, .spz) and share them publicly. The platform includes a tour editor, public viewer, dashboard, billing via Stripe, and auth via Supabase.

Tech stack: Next.js 14 (App Router), Supabase (auth, database, storage), Stripe (billing), Three.js + gsplat.js (3D rendering), Resend (email), Vercel (hosting).

## 2. Architecture

pnpm monorepo with Turborepo:

```
apps/
  web/          — Next.js 14 App Router (main application)
packages/
  db/           — Supabase client exports, migration SQL files
  types/        — Shared TypeScript types (no runtime code)
  ui/           — Shared shadcn/ui component library
```

## 3. Getting Started

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start Next.js dev server
pnpm build            # Build all packages
pnpm typecheck        # TypeScript type checking
pnpm lint             # Run ESLint
```

## 4. Environment Variables

Required env vars (see `.env.local.example`):

| Variable | Context | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Supabase service role key — NEVER expose to client |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client + Server | Stripe publishable key |
| `STRIPE_SECRET_KEY` | **Server only** | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | **Server only** | Stripe webhook signing secret |
| `RESEND_API_KEY` | **Server only** | Resend email API key |
| `NEXT_PUBLIC_APP_URL` | Client + Server | Application base URL |

## 5. Directory Structure

```
apps/web/
  src/
    app/            — Next.js App Router pages and layouts
    components/     — App-specific React components
    components/ui/  — shadcn/ui components (generated)
    lib/            — Utility functions (cn, etc.)
packages/db/
  src/              — Supabase client exports
  migrations/       — SQL migration files
packages/types/
  src/              — TypeScript interfaces and type definitions
packages/ui/
  src/              — Shared UI components
```

## 6. Code Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- No `any` types — enforced via ESLint `no-explicit-any` rule
- Use `cn()` utility for conditional Tailwind classes
- shadcn/ui components first, Tailwind utilities only, no raw CSS
- All API inputs validated with Zod
- Workspace imports: `@cloudtour/types`, `@cloudtour/db`, `@cloudtour/ui`

## 7. Design System

Color palette (oklch):
- `--bg`: oklch(97.5% 0.006 68) — warm alabaster background
- `--surface`: oklch(99% 0.003 68)
- `--text-primary`: oklch(22% 0.02 68) — space ink, never pure black
- `--brand`: oklch(38% 0.16 268) — deep spatial indigo
- `--accent`: oklch(72% 0.165 62) — warm amber for CTAs

Typography:
- Display/headings: Cormorant Garamond (variable, 300-700)
- UI/body: Geist (variable)
- Fluid type scale with `clamp()` values
- Never use Inter or system-ui in marketing contexts

Motion:
- `--ease-out`: cubic-bezier(0.16, 1, 0.3, 1)
- `--ease-in-out`: cubic-bezier(0.65, 0, 0.35, 1)
- `--duration-fast`: 120ms, `--duration-base`: 200ms, `--duration-slow`: 400ms

Forbidden patterns:
- No glassmorphism
- No bounce animations on cards
- No elastic on dropdowns
- No pure black text
- No Inter/system-ui in marketing

## 8. Database

Supabase with RLS enabled on all tables. 10 core tables: profiles, organizations, org_members, tours, scenes, waypoints, hotspots, floor_plans, billing_events, tour_views.

RBAC hierarchy: owner > admin > editor > viewer.

Slug deduplication always uses sequential suffixes (-2, -3), never random.

## 9. Testing

Run quality checks before every commit:
```bash
pnpm typecheck    # Must pass
pnpm lint         # Must pass
pnpm build        # Must succeed
```

## 10. Security

- `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in client code or `NEXT_PUBLIC_` env vars
- RLS enabled on every table — no row accessible without valid JWT (except published tours)
- All API inputs validated with Zod — reject before business logic
- Stripe webhook signatures always verified
- File uploads validated via magic bytes, never file extensions
- Rate limiting on all API endpoints
