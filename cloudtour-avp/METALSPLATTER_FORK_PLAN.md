# MetalSplatter Fork Plan

## Status

**Shipped 2026-04-30.** Fork live at
<https://github.com/EdwardZehuaZhang/MetalSplatter>, tag
`1.0.1-cloudtour.1` published, AVP project pinned via `exactVersion`.
xcodebuild visionOS Simulator green against the fork.

## Current Dependency

- Package: `https://github.com/scier/MetalSplatter`
- Pin: `1.0.1` (revision `71ff248e3016ac43c0a9271e322538421b28c360`)
- Wired in `cloudtour-avp/project.yml` and resolved via `CloudTourVision.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.

## Why Fork

Editor work in M4 (brush, box, lasso erase) needs runtime mutation of the splat buffers and per-frame access to GPU-resident gaussian state. Upstream `MetalSplatter`:

1. Treats the splat array as immutable post-load. Erase tools need to remove gaussians (or mask them) without re-uploading the entire `.ply`/`.splat`/`.spz`.
2. Hides the per-frame GPU sort/cull pipeline behind a private API surface, blocking selection-mask integration (box/lasso volumes need to participate in the visibility test).
3. Has no hook for emitting depth or world-position read-back, which the brush/box/lasso tools need to convert hand-pinch positions into splat-index sets.
4. Pins to a small set of vertex attributes; we expect to add a per-splat `mask` attribute (1 byte) that survives reload from disk after a Save.

Forking lets us land these changes against a stable base while we contribute upstream PRs in parallel.

## Scope Of Fork

In scope:

- Expose a public `SplatBuffer` view (read + tagged-write) so the renderer can mark splats as masked-out without dropping them from the GPU buffer.
- Add an optional `mask: UInt8` per-splat attribute path through `.splat` / `.spz` IO. Default zero on legacy assets.
- Surface a `frameDepthTexture` accessor on the renderer for hand-target raycasts.
- Add a `applyMaskRange(_:)` API to flip mask bits for a slice of splat indices in-place (used by brush/box/lasso commit).
- Keep upstream tests green; add tests for the new mask path.

Out of scope (for now):

- Re-sort acceleration structure changes.
- New file format support (we keep `.ply` / `.splat` / `.spz`).
- Cross-platform (macOS-only / iOS-only) work — visionOS remains primary.

## Branch Strategy

- Fork to `EdwardZehuaZhang/MetalSplatter` from `1.0.1` tag.
- Long-lived integration branch: `cloudtour/main`. All CloudTour changes land here.
- Topic branches per change (e.g., `cloudtour/mask-attribute`, `cloudtour/depth-readback`) merged into `cloudtour/main` via PR.
- Tag releases as `1.0.1-cloudtour.N` so SPM consumers (this app) pin to a known revision rather than a moving branch.
- Rebase `cloudtour/main` onto upstream `main` monthly. Resolve conflicts in topic branches first to keep the merge clean.

## Upstream Contribution

Each topic branch corresponds to an upstream PR. Order:

1. `mask-attribute` — additive, low-risk, useful to other consumers.
2. `depth-readback` — opt-in renderer hook.
3. `apply-mask-range` — depends on `mask-attribute` landing first.

If upstream merges, we drop the topic branch and rebase `cloudtour/main`.

## SPM Wiring

In `cloudtour-avp/project.yml`, swap:

```yaml
MetalSplatter:
  url: https://github.com/scier/MetalSplatter
  from: "1.0.0"
```

to:

```yaml
MetalSplatter:
  url: https://github.com/EdwardZehuaZhang/MetalSplatter
  exactVersion: "1.0.1-cloudtour.1"
```

`exactVersion` (not `from:`) so we never silently drift onto upstream tags that don't carry our patches. Bump the pin in lockstep with each fork release.

## Risk / Mitigation

- **Drift from upstream.** Mitigate via monthly rebase + topic-PR-first cadence above.
- **Unsigned visionOS framework.** Same signing posture as today (the package is built from source by SPM in our app target). No change.
- **Breaking changes mid-feature.** `cloudtour/main` is the only consumer pin; topic branches stay rebasable until they land.

## Acceptance Criteria

This doc is "done" when:

- The fork exists on GitHub at the URL above.
- `cloudtour/main` builds against `cloudtour-avp` with no warnings.
- The `mask-attribute` upstream PR is open.
- `project.yml` and `Package.resolved` are updated to the fork pin in a follow-up commit (M4.16 — out of scope for M4.14).

## Local execution log (2026-04-30)

Done locally in `/Users/gel/Desktop/Github/MetalSplatter`:

- Cloned `scier/MetalSplatter` and checked out tag `1.0.1`.
- Created `cloudtour/main` from `1.0.1`.
- Topic branch `cloudtour/mask-attribute` (commit `a78bb13`):
  - `SplatChunk.masks: MetalBuffer<UInt8>?` (nil by default — zero memory cost on legacy chunks).
  - `SplatChunk.enableMasks(device:)` allocates a zero-initialised buffer.
  - `SplatChunk.applyMaskRange(_:value:device:)` writes a contiguous range; clips out-of-range indices.
  - 3 new unit tests covering default-nil, zero-init, and apply-range with clip.
- Topic branch `cloudtour/depth-readback` (commit `e980353`):
  - `SplatRenderer.frameDepthTexture: MTLTexture?` and `SplatRenderer.frameColorTexture: MTLTexture?` public read-only properties.
  - Captured at the top of `render(...)` BEFORE the access-state guard so a skipped render still leaves the previous frame's pointers usable for hand-target raycasts on a different cadence.
- Both topics merged into `cloudtour/main` with `--no-ff`.
- Tagged `1.0.1-cloudtour.1` on `cloudtour/main`.
- `swift build`: green. `swift test --filter ChunkTests`: 9/9 pass (6 upstream + 3 new). The `SplatRendererChunkTests` failures are upstream baseline (Metal default library not found in CLI test harness — same in the unforked tree).

`applyMaskRange(_:)` shader integration is intentionally deferred. The
fork only exposes the storage and the write API; a follow-up patch will
add a visibility test in the vertex shader gated on a feature flag.

## Push to GitHub

These are reversible at the local level but visible-to-others once
pushed. Run them when ready (require `gh auth login` or equivalent
write access to `EdwardZehuaZhang/MetalSplatter`):

```bash
# 1. Create the empty fork (skip if it already exists).
gh repo fork scier/MetalSplatter --clone=false --org=

# 2. From the local clone:
cd /Users/gel/Desktop/Github/MetalSplatter
git remote add fork https://github.com/EdwardZehuaZhang/MetalSplatter.git

# 3. Push the integration branch and topic branches.
git push fork cloudtour/main
git push fork cloudtour/mask-attribute
git push fork cloudtour/depth-readback

# 4. Push the release tag.
git push fork 1.0.1-cloudtour.1

# 5. Open upstream contribution PRs (optional, can be deferred):
gh pr create --repo scier/MetalSplatter --base main --head EdwardZehuaZhang:cloudtour/mask-attribute \
    --title "Optional per-splat mask attribute" --body "Adds opt-in mask buffer + applyMaskRange API. Default nil so legacy chunks are zero-cost."
gh pr create --repo scier/MetalSplatter --base main --head EdwardZehuaZhang:cloudtour/depth-readback \
    --title "Expose last-rendered frame textures" --body "Adds public frameColorTexture / frameDepthTexture accessors for downstream raycast tools."
```

## SPM pin swap (post-push, follow-up)

After the push completes, apply this diff to swap the AVP project off
upstream and onto the fork:

```yaml
# cloudtour-avp/project.yml
 packages:
   MetalSplatter:
-    url: https://github.com/scier/MetalSplatter
-    from: "1.0.0"
+    url: https://github.com/EdwardZehuaZhang/MetalSplatter
+    exactVersion: "1.0.1-cloudtour.1"
```

Then `xcodegen generate` and `xcodebuild -resolvePackageDependencies`
to refresh `Package.resolved`, and commit both files in one change.
