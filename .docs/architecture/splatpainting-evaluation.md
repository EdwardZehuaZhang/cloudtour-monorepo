---
status: accepted
date: 2026-04-27
---

# ADR-001 — Do not integrate `nv-tlabs/SplatPainting`

## Context

Edward asked whether SplatPainting (SIGGRAPH 2025, NVIDIA Toronto AI Lab) could be plugged into the AVP splat editor as a shortcut to richer brush/edit tooling.

Source: <https://github.com/nv-tlabs/SplatPainting>, <https://splatpainting.github.io/>.

## Decision

**No code, weights, or runtime integration.** Treat as inspiration only.

## Why

1. **License** — Repo limited to non-commercial research and evaluation. Upstream `gsplats` carries Inria/MPII non-commercial license. CloudTour ships paid plans → categorical block.
2. **Stack mismatch** — Python 3.9+ / PyTorch 2.x / CUDA 12.1 / modified differential gaussian rasterizer. visionOS = Apple Silicon Metal. Zero runtime overlap. Even running it as a remote service requires per-session CUDA hardware.
3. **No embeddable surface** — Desktop GUI (`python main.py`) only. No JSON-RPC, HTTP, or library mode.
4. **Feature shape inverted** — They *paint* new gaussians via stamp/stroke brushes against existing scenes. Our editor *erases* (brush/box/lasso) + calibrates + places waypoints. Different problem.
5. **Format gap** — PLY only on input; we ship `.splat` and `.spz` too. Round-trip would lose data.

## Concepts worth borrowing (M5.23)

The brush-as-stamp paradigm is genuinely novel and useful for our hole-fill / patch-up use case. Re-implement natively in Metal on top of the MetalSplatter fork (M4.16):

- **Stamp brush:** select a region of an existing splat → save its gaussians as a "brush" with canonical local frame → paste at a target with translation/rotation.
- **Blend percentage:** cap overlap between successive stamps to prevent splat density blow-up.
- **Jitter:** small random scale + in-plane rotation per stamp for natural-looking repeats (vegetation, tile patterns).
- **Connectivity selection:** flood-fill selection mode as a third option beside box/lasso.

These are concept-only. No code, no weights.

## Consequences

- M5 gains task **M5.23** (P2): native stamp/clone tool. Depends on M4.16 (fork) and M5.1 (undo/redo so stamps are reversible).
- We owe a reference in `.docs/milestones/M5.md` pointing to this ADR.
- If a future reviewer asks "why not SplatPainting?" the answer is this file. Don't re-litigate without new license terms upstream.

## Follow-ups

- Watch upstream license — if Inria/MPII relicenses `gsplats` to Apache or similar, revisit.
- Watch for Metal port of the differential rasterizer (none known as of 2026-04-27).
