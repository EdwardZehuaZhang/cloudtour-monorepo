# CloudTour Vision — Design Guiderails

Reference for designing and generating UI/UX for the CloudTour visionOS app.
This is a **guiderail**, not a component library: prefer Apple's native SwiftUI
components and the Human Interface Guidelines. When generating new screens,
treat this document as a hard checklist.

- Target: visionOS 26.0+, Swift 6, SwiftUI
- Bundle: `com.cloudtour.vision`
- App philosophy: elegant, calm, Apple-native — no custom chrome

---

## 1. Pillars (from Apple HIG for visionOS)

Every screen must serve all five pillars. If a design choice undermines one,
remove it.

| Pillar | Meaning | Practical rule |
|---|---|---|
| **Familiar** | Reuse iPad/Mac mental models. | Default to `NavigationSplitView`, `TabView`, `Form`, `List`. Never invent navigation. |
| **Human-centered** | Comfortable for long sessions. | No motion that competes with head movement; minimum 60pt touch targets; respect ergonomic zone (~1m, ±30° from forward gaze). |
| **Dimensional** | Use depth meaningfully. | Ornaments and volumes only when they add value. Never fake depth on flat windows. |
| **Immersive** | Match the immersion to the task. | Browsing → Shared Space (windows). Tour viewing → Full Space (`ImmersiveSpace`). Settings/Auth → never immersive. |
| **Authentic** | Reflect what the app actually is. | CloudTour shows real spaces — typography and materials should feel architectural and quiet, not gamified. |

---

## 2. Spatial Layout

### Window types

- **`WindowGroup`** — Dashboard, Explore, Settings, FAQ, Auth.
- **`ImmersiveSpace(for: SplatFileIdentifier)`** — Splat playback only. One at a time.
- **No `Volume`** unless we add 3D scene preview chips. If introduced, keep ≤ 0.5 m³.

### Window sizing

- Default the main window with `.defaultSize(width: 1280, height: 820)` (a 3:2 reading rectangle, comfortable at arm's length).
- Editor / detail windows may open as additional `WindowGroup(id:)` rather than sheets. **Sheets are a last resort on visionOS** — they break spatial context.
- Keep content within a 1280pt-wide reading column; multi-pane layouts use `NavigationSplitView` columns, not absolute frames.

### Ornaments

Use `.ornament(attachmentAnchor: ... )` for persistent tools attached to a window:
playback controls, scene jumper, viewer reticle toggle, share button.

- Ornaments belong on the **bottom edge** for primary controls, **leading** for context switchers.
- One ornament per edge maximum. If you need more, the screen is too busy.
- Ornaments must use `.glassBackgroundEffect()` so they read as floating chrome.

### Toolbars vs Ornaments vs Sheets

| Need | Use |
|---|---|
| Per-window tools always visible | **Ornament** |
| In-flow actions tied to a list/form | **`.toolbar`** |
| Modal task that blocks the window | **New WindowGroup** (preferred) or `.sheet` (only if non-blocking) |
| Confirmation / single decision | `.alert` or `.confirmationDialog` |

---

## 3. Materials, Color, Glass

**Rule:** raw `Color.green.opacity(0.15)` etc. is forbidden in chrome. visionOS adapts
materials to passthrough lighting; raw colors do not.

| Surface | Material |
|---|---|
| Primary windows | system-default (do not set background) |
| Cards / panels | `.regularMaterial` |
| Floating overlays, ornaments, transient HUDs | `.ultraThinMaterial` + `.glassBackgroundEffect()` |
| Status badges | `.fill.tertiary` / `.fill.quaternary`, with `.foregroundStyle(.secondary)` for the label |
| Destructive emphasis | `.tint(.red)` on the control, never a red background panel |

Vibrancy: text and SF Symbols on materials must use `.foregroundStyle(.primary | .secondary | .tertiary)` so vibrancy applies. Never hard-code `.white` or `.black`.

Brand color: tint accents only — `.tint(Color.accentColor)` on `Button`, `Toggle`, `Picker`. Brand color must come from the asset catalog so it can adapt.

### Forbidden
- Pure black or pure white backgrounds
- Custom blur via `.blur(radius:)` for chrome (use materials)
- Raw `Color(red:green:blue:)` in any view body — use `Color("Name")` from assets or system materials
- Glassmorphism imitations (extra borders, custom inner shadow) — `.glassBackgroundEffect()` already handles this

---

## 4. Typography

visionOS auto-adjusts size based on viewing distance — **never** override font sizes in points unless absolutely required.

| Role | Style |
|---|---|
| Display titles (e.g. tour hero) | `.font(.extraLargeTitle)` or `.extraLargeTitle2` |
| Section headers | `.font(.title2)` or `.title3` |
| Body | `.font(.body)` |
| Captions / metadata | `.font(.caption)` with `.foregroundStyle(.secondary)` |

- Default to system font (SF Pro). Marketing fonts from the web app (Cormorant Garamond) **do not** belong in the visionOS app — they're designed for 2D web reading distance.
- Use Dynamic Type. Test with the largest accessibility size before merging any new screen.
- Line length: 50–75 characters. On a 1280pt window with `.body`, this is roughly a 720pt content column.

---

## 5. Input — Eyes and Hands

### Targets

- **Minimum hit target: 60pt × 60pt** (Apple recommends 60pt for primary, 44pt absolute floor).
- Spacing between targets: **≥ 16pt** so eye-targeting doesn't ambiguate.
- All interactive elements must declare focus: SwiftUI controls (`Button`, `Toggle`, `NavigationLink`) handle this automatically. Custom `onTapGesture` on a plain `View` does not — wrap in a `Button` instead.

### Hover effect

- Every tappable area should have `.hoverEffect()` (default `.automatic`) so the gaze ring lands cleanly.
- For non-rectangular shapes (cards with rounded corners, circular icons), use `.hoverEffect(.highlight, in: RoundedRectangle(cornerRadius: 24))` so the hover lift matches the visual shape.

### Gestures

- Pinch = primary (replaces tap).
- Two-handed gestures only for direct manipulation (zoom, rotate). Never bind app navigation to two-handed gestures.
- Avoid drag-from-edge gestures — they conflict with system back.

---

## 6. Motion & Comfort

- Default to `.animation(.smooth, value: ...)` or `.snappy` for chrome. No bounces, no springs with overshoot.
- Never animate the **window itself** moving — the user moves the window, not the app.
- Inside an `ImmersiveSpace`: avoid camera-attached UI that moves with head turn. Prefer world-locked panels.
- Vection (perceived self-motion) causes nausea: do not auto-pan, auto-zoom, or auto-rotate splat scenes without explicit user input.
- Fade transitions instead of slides between immersive states.
- Honor `@Environment(\.accessibilityReduceMotion)` — drop to crossfades.

---

## 7. Immersion Tiers

| Tier | When | Implementation |
|---|---|---|
| **Shared Space** (default) | Browsing, editing, settings | Standard `WindowGroup`s; user can have other apps open. |
| **Progressive (Mixed)** | Splat preview with passthrough still visible | `ImmersiveSpace` with `.mixed` style; user crown blends. |
| **Full** | Architectural walkthrough where realism matters | `.full` style; gate behind explicit "Enter immersive" CTA. |

- Always offer an **exit affordance** (close button on an ornament) inside any immersive space — never trap the user in the Digital Crown.
- Show a 1–2 second fade-in when entering full immersion.

---

## 8. Accessibility

Required on every PR:

- VoiceOver labels on every interactive element (`.accessibilityLabel`, `.accessibilityHint`).
- Dynamic Type up to AX5 must reflow without truncation.
- `accessibilityReduceMotion` and `accessibilityReduceTransparency` honored.
- Color is never the only signal — pair with SF Symbol or text.
- Captions option present for any narrated tour.

---

## 9. Components — Native Mapping

Use these by default. Do not roll our own.

| Need | Native | Notes |
|---|---|---|
| App shell | `NavigationSplitView` | Used in `Shell/AppShell.swift` ✓ |
| Tabs | `TabView` (sidebar style on visionOS) | |
| Settings | `Form` with `Section` + `LabeledContent` | Used in `Settings/SettingsView.swift` ✓ |
| Lists | `List` / `LazyVGrid` for cards | |
| Empty states | `ContentUnavailableView` | Already used ✓ |
| Search | `.searchable(text:)` | |
| Async images | `AsyncImage` with `.transaction(.smooth)` | |
| Progress | `ProgressView` | |
| Loading shells | Native `.redacted(reason: .placeholder)` | No skeleton libraries |
| Sheets | `.sheet` only for ≤ 1 screen of input; otherwise open a new window |
| Popovers | `.popover` (auto-converts to ornament-style on visionOS) | |
| Confirmations | `.alert`, `.confirmationDialog` | |
| Date/time | `DatePicker` | |

### Buttons

- Primary CTA: `.buttonStyle(.borderedProminent)` + `.controlSize(.large)`.
- Secondary: `.buttonStyle(.bordered)`.
- Tertiary in dense lists: `.buttonStyle(.plain)` + `.hoverEffect()`.
- Destructive: add `.tint(.red)` and confirm via `.confirmationDialog`.

### Cards

- Use `RoundedRectangle(cornerRadius: 24, style: .continuous)` filled with `.regularMaterial`.
- Padding: 24pt. Inner element spacing: 12–16pt.
- Hover: `.hoverEffect(.lift)` for clickable cards.
- No drop shadows — visionOS depth comes from glass, not from shadows.

---

## 10. Reference Implementations

### Canonical Apple samples (study these before generating)

- **Hello World** — windows, volumes, ornaments, immersive spaces minimal example
  https://developer.apple.com/documentation/visionos/world
- **Destination Video** — best example of sidebar-driven library + media playback ornaments
  https://developer.apple.com/documentation/visionos/destination-video
- **Diorama** — RealityKit + UI overlay, world-anchored content
  https://developer.apple.com/documentation/visionos/diorama
- **BOT-anist** — combined window + volume + immersive flow
  https://developer.apple.com/documentation/visionos/BOT-anist

### Curated opensource references (read-only — do not depend on them)

- **Settings-visionOS** — re-implementation of system Settings; reference for `Form`/`Section`/`LabeledContent` density
  https://github.com/zhrispineda/Settings-visionOS
- **VisionOS2SampleVolumeOrnaments** — ornaments attached to volumes
  https://github.com/tokufxug/VisionOS2SampleVolumeOrnaments
- **ScenesManager** — patterns for orchestrating multiple windows + immersive spaces
  https://github.com/Tab-To-Tap/ScenesManager
- **Cubes** — minimal volumetric scene example
  https://github.com/dougholland/Cubes
- **SystemOverlayExample** — system-style overlays
  https://github.com/tochi/SystemOverlayExample

These are guiderails, not dependencies. Read them, mirror the patterns, do not vendor them in.

---

## 11. Forbidden List (auto-reject in review)

1. Custom blur via `.blur(radius:)` on UI chrome — use materials.
2. Raw `Color.green/.orange/.red.opacity(...)` for status surfaces — use `.fill.tertiary` + `.foregroundStyle(.green)` on a symbol.
3. Hit targets `< 60pt` for primary actions, `< 44pt` floor for any tappable.
4. Sheets used as primary modal navigation (open a window instead).
5. Pure black or pure white backgrounds.
6. Camera-attached / head-locked UI inside immersive spaces.
7. Auto-pan / auto-zoom in splat playback without user input.
8. Drop shadows on cards.
9. Fixed-pixel font sizes (`.font(.system(size: 17))`) — use semantic styles.
10. Inter / Cormorant Garamond / system-ui in the visionOS target.
11. Glassmorphism imitations layered on top of `.glassBackgroundEffect()`.
12. `onTapGesture` on a non-`Button` view for navigation actions.

---

## 12. Current-state remediation (audit findings)

These are concrete fixes derived from the existing codebase. Resolve before
adding new screens that copy the same patterns.

- **`Dashboard/TourEditorView.swift` ~L181** — `Color.green.opacity(0.15)` / `Color.orange.opacity(0.15)` status pills. Replace with `Capsule().fill(.fill.tertiary)` and a tinted SF Symbol.
- **`Explore/TourDetailView.swift` ~L61** — `frame(width: 80, height: 60)` thumbnail. Either bump to ≥ 60pt on the short axis with hover effect, or remove the tap target on the image and tap the row instead.
- **`Shell/AppShell.swift`, `Settings/SettingsView.swift`, `MembersView`, `WaypointEditorView`** — multiple `.sheet` modals. Audit each: if the modal contains > 1 logical screen, promote to a separate `WindowGroup(id:)`. Auth modal can stay as `.sheet` (single short flow).
- **No `glassBackgroundEffect()` or `hoverEffect()` in current code** — apply to all custom interactive surfaces (cards, ornament hosts).
- **`WaypointOverlay`** uses `.ultraThinMaterial` ✓ — replicate this pattern for new floating chrome.
- **Add ornaments** for the splat viewer: scene jumper (leading), playback / reticle toggle (bottom).

---

## 13. Generation checklist

When asking an AI (or a teammate) to generate a new screen, paste the following
into the prompt alongside the task:

```
Constraints:
- visionOS 26+, SwiftUI, Swift 6
- Use NavigationSplitView / TabView / Form / List — no custom navigation
- Materials only: .regularMaterial, .ultraThinMaterial, .glassBackgroundEffect()
- No raw Color RGB values for chrome; use .fill.tertiary or system materials
- Min hit target 60pt; .hoverEffect() on every tappable
- Semantic fonts only (.body, .title2, .extraLargeTitle); no fixed point sizes
- Sheets only for single-screen flows; otherwise open a new WindowGroup
- Ornaments via .ornament(attachmentAnchor:) for persistent tools
- VoiceOver labels + Dynamic Type required
- Honor accessibilityReduceMotion / accessibilityReduceTransparency
- See cloudtour-avp/DESIGN.md §11 forbidden list
```

---

## 14. Open questions / pending decisions

- Asset catalog brand color name and dark-mode counterpart — TBD.
- Whether tour browsing benefits from a `Volume` preview (3D card) — prototype required.
- Captions/audio description data model — depends on web-app schema sync.
