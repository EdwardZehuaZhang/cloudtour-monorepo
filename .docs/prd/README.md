# PRDs

Per-feature Product Requirement Documents. The Ralph agent loop also reads `prd.json` at the repo root — that file should eventually be moved here (`prd/prd.json`) and the loop's path updated, but until then keep both in sync if forking.

## File template

```markdown
---
status: draft | active | shipped
owner: <name>
updated: YYYY-MM-DD
linked-milestones: [M5]
---

# <Feature Name>

## Problem
What hurts today.

## Goal
What the user can do after this ships.

## Non-goals
What we explicitly defer.

## User stories
- **US-NN** — As a <role>, I can <action> so that <outcome>.

## Acceptance criteria
Concrete, testable.

## Open questions
```
