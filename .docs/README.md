# `.docs/` — Project Reference

Persistent home for product specs, milestones, and requirements that outlive any single session. Anything pasted into chat that should survive across conversations belongs here.

## Layout

| Folder | What lives here |
|---|---|
| `prd/` | Product Requirement Documents. One file per feature/initiative (`<feature>.md`) plus the master `prd.json` that the Ralph agent loop consumes. |
| `milestones/` | Milestone trackers — `M1.md`, `M2.md`, … `M5.md`. Each lists numbered tasks (`M5.1`, `M5.2` …) with `passes` flags and short descriptions. The source of truth when chat references "M5.7", "M4.13", etc. |
| `requirements/` | Cross-cutting requirements: security, accessibility, performance budgets, browser/device support, compliance (PDPA, etc.). Stable, slow-moving. |
| `architecture/` | Architecture decision records (ADRs), system diagrams, fork plans (e.g. `metalsplatter-fork.md`). |

## Conventions

- **One file = one concern.** Don't pile multiple features into one doc.
- **Filenames are kebab-case.** `tour-editor-prd.md`, not `Tour Editor PRD.md`.
- **Status front-matter on every doc:**

  ```markdown
  ---
  status: draft | active | shipped | superseded
  owner: <name or @handle>
  updated: YYYY-MM-DD
  ---
  ```

- **Milestone tasks use stable IDs.** Once `M5.7` exists, never renumber it — mark it `superseded` instead. Future agents look these up by ID.
- **Link, don't duplicate.** A milestone task may reference a PRD or ADR; don't paste the prose twice.

## Why this exists

Chat-only specs vanish. When a future session asks "what is M5.7?" the model has no answer unless the spec lives in the repo. `.docs/` is that surface.
