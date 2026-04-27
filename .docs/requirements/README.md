# Requirements

Cross-cutting, slow-moving requirements. One file per domain.

Suggested files:

- `security.md` — auth, RLS, env-var secrets posture, OWASP top-10 review notes
- `accessibility.md` — WCAG target, keyboard / VoiceOver checklists
- `performance.md` — Lighthouse / Web Vitals budgets, splat-load latency targets
- `compliance.md` — PDPA (Singapore), data-retention rules
- `device-support.md` — visionOS / browser / iOS version matrix

Add only when the constraint is real and persistent. Empty docs rot — better to leave the slot vacant.
