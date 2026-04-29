#if os(visionOS)

import ARKit
import CompositorServices
import Foundation
import Metal
import MetalSplatter
import os
import QuartzCore
import simd
import SplatIO
import SwiftUI

struct SplatImmersiveConfiguration: CompositorLayerConfiguration {
    func makeConfiguration(capabilities: LayerRenderer.Capabilities, configuration: inout LayerRenderer.Configuration) {
        configuration.depthFormat = .depth32Float
        configuration.colorFormat = .bgra8Unorm_srgb

        let foveationEnabled = capabilities.supportsFoveation
        configuration.isFoveationEnabled = foveationEnabled

        let options: LayerRenderer.Capabilities.SupportedLayoutsOptions =
            foveationEnabled ? [.foveationEnabled] : []
        let supportedLayouts = capabilities.supportedLayouts(options: options)

        configuration.layout = supportedLayouts.contains(.layered) ? .layered : .dedicated
    }
}

extension LayerRenderer.Clock.Instant.Duration {
    fileprivate var timeInterval: TimeInterval {
        let nanoseconds = TimeInterval(components.attoseconds / 1_000_000_000)
        return TimeInterval(components.seconds) + (nanoseconds / TimeInterval(NSEC_PER_SEC))
    }
}

/// Drives Metal rendering for a Gaussian splat file inside a visionOS
/// CompositorLayer. Thread safety is managed manually via an unfair lock
/// around navigation state shared between the render thread and the async
/// hand-tracking consumer.
final class SplatImmersiveRenderer: @unchecked Sendable {
    private static let log = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.cloudtour.vision",
        category: "SplatImmersiveRenderer"
    )

    static let maxSimultaneousRenders = 3
    static let maxMarkersPerFrame = 64
    static let modelCenterZ: Float = -2
    static let reticleDistance: Float = 3.0
    static let reticleRadius: Float = 0.05
    static let waypointRadius: Float = 0.18
    static let waypointHitRadiusMultiplier: Float = 1.8
    static let waypointMaxAimDistance: Float = 25.0
    static let dollyDuration: TimeInterval = 0.6
    static let pinchThreshold: Float = 0.025

    static let reticleColor = SIMD4<Float>(1, 1, 1, 0.6)
    static let waypointColor = SIMD4<Float>(0.40, 0.78, 1.0, 0.55)
    static let waypointAimedColor = SIMD4<Float>(1.0, 0.78, 0.30, 0.85)
    /// Committed hotspot — warm amber, distinct from cool waypoint blue so
    /// the user can tell tap-to-content nodes from teleport nodes at a glance.
    static let hotspotColor = SIMD4<Float>(1.0, 0.62, 0.18, 0.65)
    static let hotspotAimedColor = SIMD4<Float>(1.0, 0.85, 0.40, 0.95)
    /// Pending (unsaved) hotspot — green, matches the pending-waypoint hue
    /// so "draft" reads consistently across tools.
    static let pendingHotspotColor = SIMD4<Float>(0.30, 0.85, 0.55, 0.70)
    static let pendingHotspotSelectedColor = SIMD4<Float>(1.0, 0.85, 0.40, 0.95)
    static let hotspotRadius: Float = 0.14
    /// M7.7 — committed comment marker (violet). Resolved comments render
    /// at half alpha so the user sees them de-emphasised.
    static let commentColor = SIMD4<Float>(0.55, 0.40, 0.90, 0.65)
    static let commentResolvedColor = SIMD4<Float>(0.55, 0.40, 0.90, 0.25)
    static let commentAimedColor = SIMD4<Float>(0.85, 0.70, 1.0, 0.95)
    /// Pending (unsaved) comment — green-violet, mirrors the pending-
    /// hotspot / pending-waypoint hue language.
    static let pendingCommentColor = SIMD4<Float>(0.55, 0.85, 0.55, 0.70)
    static let pendingCommentSelectedColor = SIMD4<Float>(1.0, 0.85, 0.40, 0.95)
    static let commentRadius: Float = 0.10
    /// M7.6 — peer editor aim cone marker (cyan; high alpha so co-editor
    /// presence reads at a glance).
    static let peerAimColor = SIMD4<Float>(0.30, 0.85, 1.0, 0.85)
    static let peerAimRadius: Float = 0.08
    /// Pending (in-session-not-yet-saved) waypoints — green to clearly
    /// signal "this is a draft you haven't committed yet".
    static let pendingWaypointColor = SIMD4<Float>(0.30, 0.85, 0.55, 0.65)
    static let pendingWaypointAimedColor = SIMD4<Float>(1.0, 0.78, 0.30, 0.85)
    /// 1.7 m calibration silhouette colour. Distinct hue from waypoints
    /// so the user does not confuse it with an interactable marker.
    static let silhouetteColor = SIMD4<Float>(0.95, 0.78, 0.30, 0.55)
    static let silhouetteAnchorX: Float = 0.5
    static let silhouetteAnchorZ: Float = modelCenterZ
    /// Live brush sphere preview — follows the (possibly-pinched) hand so
    /// the user sees the volume that will be marked on next pinch.
    static let brushPreviewColor = SIMD4<Float>(1.0, 0.32, 0.32, 0.30)
    /// In-session pending deletion spheres — committed regions get a
    /// slightly more saturated tint than pre-existing committed deletions.
    static let pendingDeletionColor = SIMD4<Float>(1.0, 0.20, 0.20, 0.45)
    static let committedDeletionColor = SIMD4<Float>(0.60, 0.20, 0.20, 0.30)
    static let defaultBrushRadius: Float = 0.15
    static let minBrushRadius: Float = 0.03
    static let maxBrushRadius: Float = 0.50

    let layerRenderer: LayerRenderer
    let device: MTLDevice
    let commandQueue: MTLCommandQueue

    private var splatRenderer: SplatRenderer?
    private var reticleRenderer: ReticleRenderer?
    private let inFlightSemaphore = DispatchSemaphore(value: maxSimultaneousRenders)
    private let session: SplatSession
    private let waypoints: [WaypointMarker]
    private let hotspots: [HotspotMarker]
    private let comments: [CommentMarker]

    /// M6.3 — splat-local AABB computed at load time from raw points (post
    /// deletions). nil until `load()` finishes. Read by snap-to-floor.
    /// `splat-local` here means the same coordinate space as
    /// `SplatScenePoint.position` — i.e. before any user calibrate transform.
    private let aabbLock = OSAllocatedUnfairLock(initialState: AABB?(nil))
    private struct AABB { let lo: SIMD3<Float>; let hi: SIMD3<Float> }

    /// M7.6 — peer editor aim positions in splat-local coords. Updated by
    /// SwiftUI as Realtime presence broadcasts arrive; `buildMarkers`
    /// projects each through `splatModelMatrix` and renders a cyan sphere.
    private let peerAimsLock = OSAllocatedUnfairLock(initialState: [SIMD3<Float>]())

    /// M6.6 — perf counters. Frame counts + last-fps sample + last-frame
    /// marker count. Read by SwiftUI HUD via `snapshotPerfCounters()`.
    private struct PerfCounters {
        var frameCount: Int = 0
        var fpsWindowStart: TimeInterval = 0
        var fpsWindowFrames: Int = 0
        var lastFps: Double = 0
        var lastMarkerCount: Int = 0
        var lastDrawableCount: Int = 0
        var splatPointCount: Int = 0
    }
    private let perfLock = OSAllocatedUnfairLock(initialState: PerfCounters())

    private let arSession = ARKitSession()
    private let worldTracking = WorldTrackingProvider()
    private let handTracking = HandTrackingProvider()

    /// Navigation state shared between the render thread and the hand-tracking
    /// consumer task. Guarded by `stateLock`.
    private struct NavigationState {
        var viewerOffset: SIMD3<Float> = .zero
        var dollyStart: SIMD3<Float> = .zero
        var dollyTarget: SIMD3<Float> = .zero
        var dollyStartTime: TimeInterval = -1
        var pinchPending: Bool = false
        var leftPinched: Bool = false
        var rightPinched: Bool = false
        /// Latest head transform (world space) sampled in the render loop.
        /// Used by `snapshotHeadPoseInSplatLocal()` to derive a starting view.
        var lastHeadWorld: matrix_float4x4 = matrix_identity_float4x4
        /// Latest splat model matrix (splat-local → world). Cached alongside
        /// `lastHeadWorld` so the snapshot is a coherent pair.
        var lastSplatModel: matrix_float4x4 = matrix_identity_float4x4
        var hasFrameSample: Bool = false
    }
    private let stateLock = OSAllocatedUnfairLock(initialState: NavigationState())

    /// Phase of the calibrate two-hand gesture. The associated values capture
    /// the baseline transform and the per-hand world positions sampled when
    /// the phase started; deltas are computed against those baselines so the
    /// in-flight gesture is always invertible by releasing the pinch.
    private enum CalibratePhase {
        case idle
        case single(baseline: SceneTransform, initialHand: SIMD3<Float>)
        case dual(baseline: SceneTransform,
                  initialLeft: SIMD3<Float>,
                  initialRight: SIMD3<Float>)
    }

    /// In-session not-yet-persisted waypoint. SwiftUI Save flushes these
    /// to the `waypoints` table with the user-selected `target_scene_id`
    /// and a generated label.
    struct PendingWaypoint: Sendable, Hashable {
        let id: UUID
        var localPosition: SIMD3<Float>
        var targetYaw: Float?
    }

    /// M6.1 — in-session not-yet-persisted hotspot. Save flushes these to
    /// the `hotspots` table. `contentType` cycles through .text/.image/.link
    /// via aim+pinch; the SwiftUI inspector edits the rest.
    struct PendingHotspot: Sendable, Hashable {
        let id: UUID
        var localPosition: SIMD3<Float>
        var contentType: HotspotContentType
        var title: String
        var contentMarkdown: String?
        var mediaUrl: String?
    }

    /// M7.7 — in-session not-yet-persisted comment. Save flushes to
    /// `comments` table; the body field is filled from the SwiftUI
    /// inspector. `parentId` stays nil for top-level (replies use the
    /// committed-comment popover, which posts directly to BE).
    struct PendingComment: Sendable, Hashable {
        let id: UUID
        var localPosition: SIMD3<Float>
        var body: String
    }

    /// Editor state shared between the hand-tracking consumer and the render
    /// thread. Separate from `NavigationState` because tool dispatch and live
    /// transform mutation operate on a different lifecycle than dolly.
    private struct EditState {
        var transform: SceneTransform = .identity
        var activeTool: ToolMode = .view
        var calibratePhase: CalibratePhase = .idle
        var leftHandPos: SIMD3<Float>? = nil
        var rightHandPos: SIMD3<Float>? = nil
        var leftWasPinched: Bool = false
        var rightWasPinched: Bool = false
        /// Flips to `true` the first time a tool gesture mutates `transform`.
        /// SwiftUI uses it to gate the Save button when calibrating an
        /// uncalibrated scene — preventing accidental "save identity" submits.
        var hasUserAdjusted: Bool = false
        /// Single-edge pinch event consumed by the waypoint tool. Set on
        /// rising edge of either hand's pinch while waypoint mode is active.
        var waypointPinchPending: Bool = false
        var pendingWaypoints: [PendingWaypoint] = []
        /// Map of committed-waypoint id → new arrival yaw captured during
        /// this session. Flushed by SwiftUI Save as PATCH per waypoint.
        var yawUpdates: [UUID: Float] = [:]
        /// Single-edge pinch event consumed by the brush tool.
        var brushPinchPending: Bool = false
        var brushRadius: Float = SplatImmersiveRenderer.defaultBrushRadius
        /// Deletion spheres collected this session, in splat-local space.
        /// Flushed to `scene_edits.deletions.spheres` by Save.
        var pendingDeletionSpheres: [DeletionSphere] = []
        /// Last-known pinch midpoint (averaged from whichever hand is
        /// pinched) — drives the live brush preview overlay.
        var brushPreviewWorldPos: SIMD3<Float>? = nil

        // ── Box tool ────────────────────────────────────────────────────
        /// While both hands are pinching: the live AABB defined by the two
        /// pinch positions in splat-local space. On dual-pinch release,
        /// committed to `pendingDeletionBoxes`.
        var liveBoxLocal: (lo: SIMD3<Float>, hi: SIMD3<Float>)? = nil
        var pendingDeletionBoxes: [DeletionBox] = []

        // ── Lasso tool ──────────────────────────────────────────────────
        var lassoLive: LassoLiveState? = nil
        var pendingDeletionLassos: [DeletionLasso] = []

        // ── M5.11 display HUD flags ─────────────────────────────────────
        var hideWaypoints: Bool = false
        var hidePendingDeletions: Bool = false
        var hideSilhouette: Bool = false
        // ── M7.13 viewer ornament: hide aim reticle ─────────────────────
        var hideReticle: Bool = false

        // ── M6.1 hotspot tool ───────────────────────────────────────────
        /// Single-edge pinch event consumed by the hotspot tool.
        var hotspotPinchPending: Bool = false
        var pendingHotspots: [PendingHotspot] = []
        /// Pending hotspot focused by the SwiftUI inspector. Updated when
        /// the user places or aim-pinches a pending hotspot. The inspector
        /// reads/writes the matching entry by id.
        var selectedPendingHotspotId: UUID? = nil

        // ── M7.7 comment tool ──────────────────────────────────────────
        var commentPinchPending: Bool = false
        var pendingComments: [PendingComment] = []
        var selectedPendingCommentId: UUID? = nil
        /// When the comment tool aims at an *already-committed* comment,
        /// the SwiftUI thread popover resolves it via this id and queries
        /// Supabase directly for the body + replies.
        var selectedCommittedCommentId: UUID? = nil

        // ── M5.1 undo/redo history ──────────────────────────────────────
        var undoStack: [HistorySnapshot] = []
        var redoStack: [HistorySnapshot] = []
    }

    /// M5.1 — frozen slice of `EditState` covering everything a Save can
    /// emit (transform + waypoint pendings + deletion pendings). Transient
    /// state (live gestures, hand pinch flags) is intentionally excluded —
    /// undo restores the *committed* surface, not the in-flight gesture.
    private struct HistorySnapshot: Sendable {
        let transform: SceneTransform
        let hasUserAdjusted: Bool
        let pendingWaypoints: [PendingWaypoint]
        let yawUpdates: [UUID: Float]
        let pendingDeletionSpheres: [DeletionSphere]
        let pendingDeletionBoxes: [DeletionBox]
        let pendingDeletionLassos: [DeletionLasso]
        let pendingHotspots: [PendingHotspot]
        let selectedPendingHotspotId: UUID?
        let pendingComments: [PendingComment]
        let selectedPendingCommentId: UUID?
    }
    /// Cap to keep memory predictable on large erase sessions.
    private static let undoStackCap = 64

    /// In-progress lasso polyline (splat-local). Captured on first sample
    /// from the user's gaze direction at gesture start; subsequent samples
    /// extend the polygon. Committed as `DeletionLasso` on pinch release.
    private struct LassoLiveState {
        var samples: [SIMD3<Float>]
        let planeNormalLocal: SIMD3<Float>
        let planeUpLocal: SIMD3<Float>
        let planeRightLocal: SIMD3<Float>
        let planePointLocal: SIMD3<Float>
    }
    private let editLock = OSAllocatedUnfairLock(initialState: EditState())

    /// Weak reference to the most-recently-created renderer, used by the
    /// SwiftUI editor panel (Save/Recalibrate buttons) and the simulator
    /// debug pinch trigger. The race between init and a UI read is benign —
    /// at worst one button press is missed during transition.
    nonisolated(unsafe) private(set) static weak var currentRenderer: SplatImmersiveRenderer?

    init(_ layerRenderer: LayerRenderer, session: SplatSession) {
        self.layerRenderer = layerRenderer
        self.device = layerRenderer.device
        self.commandQueue = self.device.makeCommandQueue()!
        self.session = session
        self.waypoints = session.waypoints
        self.hotspots = session.hotspots
        self.comments = session.comments
        let initialTransform = session.sceneEdits?.transform ?? .identity
        // Force calibrate mode if the scene has never been calibrated, even
        // when the session was opened in view mode — uncalibrated splats
        // should never be visible at world scale.
        let needsCalibration = session.sceneEdits == nil
        let initialTool: ToolMode = (session.editMode || needsCalibration) ? .calibrate : .view
        editLock.withLock {
            $0.transform = initialTransform
            $0.activeTool = initialTool
        }
        // Reticle init is deferred to setupReticle() so the Metal shader
        // compile doesn't block whichever thread constructs us.
        Self.currentRenderer = self
    }

    /// Composes a `SceneTransform` into a 4×4 in `translation * rotation * scale` order.
    private static func editTransformMatrix(for t: SceneTransform) -> matrix_float4x4 {
        let scale = matrix4x4_scale(Float(t.scale))
        let rotation = matrix_float4x4(t.rotation.simd)
        let translation = matrix4x4_translation(
            Float(t.translation.x),
            Float(t.translation.y),
            Float(t.translation.z)
        )
        return translation * rotation * scale
    }

    // MARK: - SwiftUI-facing API (called from MainActor)

    /// Switch the active editing tool. Resets any in-flight calibrate gesture
    /// so a tool switch never strands a half-applied transform delta.
    func setActiveTool(_ tool: ToolMode) {
        editLock.withLock {
            $0.activeTool = tool
            $0.calibratePhase = .idle
        }
    }

    /// Snapshot the live transform — used by the Save button to package up
    /// the calibrated `SceneEdits` for the BE PATCH.
    func snapshotTransform() -> SceneTransform {
        editLock.withLock { $0.transform }
    }

    /// Capture the user's current head pose, expressed in splat-local
    /// coordinates, as a `CameraPosition` (position + 1 m forward target).
    /// Returns nil if the render loop hasn't sampled a frame yet (immersive
    /// space just opened).
    func snapshotHeadPoseInSplatLocal() -> CameraPosition? {
        let snapshot = stateLock.withLock { state -> (matrix_float4x4, matrix_float4x4, Bool) in
            (state.lastHeadWorld, state.lastSplatModel, state.hasFrameSample)
        }
        guard snapshot.2 else { return nil }
        let headWorld = snapshot.0
        let splatToWorld = snapshot.1
        let worldToSplat = splatToWorld.inverse

        let headPosWorld = SIMD4<Float>(headWorld.columns.3.x,
                                        headWorld.columns.3.y,
                                        headWorld.columns.3.z, 1)
        let forwardWorld = SIMD4<Float>(-headWorld.columns.2.x,
                                        -headWorld.columns.2.y,
                                        -headWorld.columns.2.z, 0)
        let targetPosWorld = SIMD4<Float>(headPosWorld.x + forwardWorld.x,
                                          headPosWorld.y + forwardWorld.y,
                                          headPosWorld.z + forwardWorld.z, 1)

        let posLocal = worldToSplat * headPosWorld
        let targetLocal = worldToSplat * targetPosWorld
        return CameraPosition(
            position: Position3D(x: Double(posLocal.x), y: Double(posLocal.y), z: Double(posLocal.z)),
            target: Position3D(x: Double(targetLocal.x), y: Double(targetLocal.y), z: Double(targetLocal.z))
        )
    }

    /// Whether the user has applied any gesture-driven change to the
    /// transform during the current immersive session.
    func hasUserAdjustedTransform() -> Bool {
        editLock.withLock { $0.hasUserAdjusted }
    }

    /// Replace the live transform — used by Recalibrate to discard the
    /// current calibration and start fresh from identity.
    func resetTransform(to t: SceneTransform) {
        editLock.withLock {
            $0.transform = t
            $0.calibratePhase = .idle
            $0.hasUserAdjusted = false
        }
    }

    /// M5.3 — restore from a local autosave draft. Replaces the transform
    /// and all pending lists. Clears history (the draft is treated as a
    /// new "starting point"). Caller is responsible for re-loading the
    /// splat (transform takes effect on next frame).
    func applyDraft(_ draft: EditorDraft) {
        let pendings = draft.pendingWaypoints.map {
            PendingWaypoint(
                id: $0.id,
                localPosition: SIMD3<Float>($0.x, $0.y, $0.z),
                targetYaw: $0.targetYaw
            )
        }
        let yawDict: [UUID: Float] = Dictionary(
            uniqueKeysWithValues: draft.yawUpdates.map { ($0.waypointId, $0.yaw) }
        )
        let hotspots: [PendingHotspot] = (draft.pendingHotspots ?? []).map {
            PendingHotspot(
                id: $0.id,
                localPosition: SIMD3<Float>($0.x, $0.y, $0.z),
                contentType: HotspotContentType(rawValue: $0.contentType) ?? .text,
                title: $0.title,
                contentMarkdown: $0.contentMarkdown,
                mediaUrl: $0.mediaUrl
            )
        }
        editLock.withLock { state in
            state.transform = draft.transform
            state.hasUserAdjusted = draft.hasUserAdjusted
            state.pendingWaypoints = pendings
            state.yawUpdates = yawDict
            state.pendingDeletionSpheres = draft.pendingDeletionSpheres
            state.pendingDeletionBoxes = draft.pendingDeletionBoxes
            state.pendingDeletionLassos = draft.pendingDeletionLassos
            state.pendingHotspots = hotspots
            state.selectedPendingHotspotId = hotspots.last?.id
            state.calibratePhase = .idle
            state.undoStack.removeAll(keepingCapacity: true)
            state.redoStack.removeAll(keepingCapacity: true)
        }
    }

    /// M5.3 — extract the renderer's mutable state into a draft snapshot
    /// suitable for `EditorDraftStore.save`. Caller supplies sceneId +
    /// optional starting view (held in SwiftUI, not the renderer).
    func snapshotDraft(sceneId: UUID, startingView: CameraPosition?) -> EditorDraft {
        editLock.withLock { state in
            let pendings = state.pendingWaypoints.map {
                DraftWaypoint(id: $0.id, x: $0.localPosition.x, y: $0.localPosition.y,
                              z: $0.localPosition.z, targetYaw: $0.targetYaw)
            }
            let yaws = state.yawUpdates.map { DraftYawUpdate(waypointId: $0.key, yaw: $0.value) }
            let hotspots = state.pendingHotspots.map {
                DraftHotspot(
                    id: $0.id,
                    x: $0.localPosition.x, y: $0.localPosition.y, z: $0.localPosition.z,
                    title: $0.title,
                    contentType: $0.contentType.rawValue,
                    contentMarkdown: $0.contentMarkdown,
                    mediaUrl: $0.mediaUrl
                )
            }
            return EditorDraft(
                sceneId: sceneId,
                savedAt: Date(),
                transform: state.transform,
                hasUserAdjusted: state.hasUserAdjusted,
                pendingWaypoints: pendings,
                yawUpdates: yaws,
                pendingDeletionSpheres: state.pendingDeletionSpheres,
                pendingDeletionBoxes: state.pendingDeletionBoxes,
                pendingDeletionLassos: state.pendingDeletionLassos,
                startingView: startingView,
                pendingHotspots: hotspots
            )
        }
    }

    /// M5.6 — apply a numerically-edited transform from the SwiftUI panel.
    /// Marks the session as user-adjusted so Save knows there's something to
    /// persist even without a gesture-driven calibrate. Pushes onto the
    /// undo stack so M5.1 can revert to the previous numeric state.
    func applyTransform(_ t: SceneTransform) {
        editLock.withLock { state in
            Self.recordHistory(&state)
            state.transform = t
            state.calibratePhase = .idle
            state.hasUserAdjusted = true
        }
    }

    /// Snapshot of pending (not yet persisted) waypoints + yaw updates on
    /// committed waypoints. Used by SwiftUI Save to flush to Supabase.
    struct WaypointEditSnapshot: Sendable {
        var pending: [PendingWaypoint]
        var yawUpdates: [UUID: Float]
    }

    func snapshotWaypointEdits() -> WaypointEditSnapshot {
        editLock.withLock {
            WaypointEditSnapshot(pending: $0.pendingWaypoints, yawUpdates: $0.yawUpdates)
        }
    }

    func clearWaypointEdits() {
        editLock.withLock {
            $0.pendingWaypoints = []
            $0.yawUpdates = [:]
            $0.waypointPinchPending = false
        }
    }

    /// Pending in-session deletion spheres (splat-local). Flushed by
    /// SwiftUI Save into `scene_edits.deletions.spheres`.
    func snapshotPendingDeletions() -> [DeletionSphere] {
        editLock.withLock { $0.pendingDeletionSpheres }
    }

    /// Pending in-session deletion boxes (splat-local AABBs).
    func snapshotPendingBoxes() -> [DeletionBox] {
        editLock.withLock { $0.pendingDeletionBoxes }
    }

    /// Pending in-session deletion lassos (splat-local plane + polygon).
    func snapshotPendingLassos() -> [DeletionLasso] {
        editLock.withLock { $0.pendingDeletionLassos }
    }

    /// M5.2 — remove a single pending edit by index. No-op if index is
    /// out of range. History snapshot is captured before the removal so
    /// undo restores the deleted item.
    func removePendingWaypoint(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingWaypoints.count else { return }
            Self.recordHistory(&state)
            state.pendingWaypoints.remove(at: idx)
        }
    }

    func removePendingDeletionSphere(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingDeletionSpheres.count else { return }
            Self.recordHistory(&state)
            state.pendingDeletionSpheres.remove(at: idx)
        }
    }

    func removePendingDeletionBox(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingDeletionBoxes.count else { return }
            Self.recordHistory(&state)
            state.pendingDeletionBoxes.remove(at: idx)
        }
    }

    func removePendingDeletionLasso(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingDeletionLassos.count else { return }
            Self.recordHistory(&state)
            state.pendingDeletionLassos.remove(at: idx)
        }
    }

    /// M5.2 — drop a recorded yaw update. Undo restores the prior value.
    func removeYawUpdate(forWaypointId id: UUID) {
        editLock.withLock { state in
            guard state.yawUpdates[id] != nil else { return }
            Self.recordHistory(&state)
            state.yawUpdates[id] = nil
        }
    }

    /// M6.1 — pending in-session hotspots (splat-local). Flushed by Save.
    func snapshotPendingHotspots() -> [PendingHotspot] {
        editLock.withLock { $0.pendingHotspots }
    }

    /// M6.1 — currently inspected pending hotspot id, if any. Drives the
    /// SwiftUI side panel binding.
    func snapshotSelectedHotspotId() -> UUID? {
        editLock.withLock { $0.selectedPendingHotspotId }
    }

    /// M6.1 — write-through update of a pending hotspot's editable fields.
    /// Pushes onto the undo stack so inspector edits are reversible.
    func updatePendingHotspot(
        id: UUID,
        title: String? = nil,
        contentType: HotspotContentType? = nil,
        contentMarkdown: String? = nil,
        mediaUrl: String? = nil
    ) {
        editLock.withLock { state in
            guard let idx = state.pendingHotspots.firstIndex(where: { $0.id == id }) else { return }
            Self.recordHistory(&state)
            if let title { state.pendingHotspots[idx].title = title }
            if let contentType { state.pendingHotspots[idx].contentType = contentType }
            // Markdown / URL are intentionally allowed to clear via empty
            // string from the inspector — the caller distinguishes "unset"
            // (omit) vs "clear" (pass empty / nil) per call site.
            if let contentMarkdown {
                state.pendingHotspots[idx].contentMarkdown = contentMarkdown.isEmpty ? nil : contentMarkdown
            }
            if let mediaUrl {
                state.pendingHotspots[idx].mediaUrl = mediaUrl.isEmpty ? nil : mediaUrl
            }
        }
    }

    func selectPendingHotspot(_ id: UUID?) {
        editLock.withLock { $0.selectedPendingHotspotId = id }
    }

    func removePendingHotspot(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingHotspots.count else { return }
            Self.recordHistory(&state)
            let removedId = state.pendingHotspots[idx].id
            state.pendingHotspots.remove(at: idx)
            if state.selectedPendingHotspotId == removedId {
                state.selectedPendingHotspotId = state.pendingHotspots.last?.id
            }
        }
    }

    func clearHotspotEdits() {
        editLock.withLock {
            $0.pendingHotspots = []
            $0.selectedPendingHotspotId = nil
            $0.hotspotPinchPending = false
        }
    }

    // MARK: - M7.7 comment APIs

    func snapshotPendingComments() -> [PendingComment] {
        editLock.withLock { $0.pendingComments }
    }

    func snapshotSelectedCommentIds() -> (pending: UUID?, committed: UUID?) {
        editLock.withLock { ($0.selectedPendingCommentId, $0.selectedCommittedCommentId) }
    }

    func updatePendingComment(id: UUID, body: String) {
        editLock.withLock { state in
            guard let idx = state.pendingComments.firstIndex(where: { $0.id == id }) else { return }
            Self.recordHistory(&state)
            state.pendingComments[idx].body = body
        }
    }

    func selectPendingComment(_ id: UUID?) {
        editLock.withLock {
            $0.selectedPendingCommentId = id
            if id != nil { $0.selectedCommittedCommentId = nil }
        }
    }

    func selectCommittedComment(_ id: UUID?) {
        editLock.withLock {
            $0.selectedCommittedCommentId = id
            if id != nil { $0.selectedPendingCommentId = nil }
        }
    }

    func removePendingComment(at idx: Int) {
        editLock.withLock { state in
            guard idx >= 0, idx < state.pendingComments.count else { return }
            Self.recordHistory(&state)
            let removedId = state.pendingComments[idx].id
            state.pendingComments.remove(at: idx)
            if state.selectedPendingCommentId == removedId {
                state.selectedPendingCommentId = state.pendingComments.last?.id
            }
        }
    }

    /// M7.6 — push the latest peer-editor aim positions (splat-local).
    /// Called from SwiftUI on each Realtime presence tick.
    func setPeerAims(_ aims: [SIMD3<Float>]) {
        peerAimsLock.withLock { $0 = aims }
    }

    func clearCommentEdits() {
        editLock.withLock {
            $0.pendingComments = []
            $0.selectedPendingCommentId = nil
            $0.selectedCommittedCommentId = nil
            $0.commentPinchPending = false
        }
    }

    func clearPendingDeletions() {
        editLock.withLock {
            $0.pendingDeletionSpheres = []
            $0.pendingDeletionBoxes = []
            $0.pendingDeletionLassos = []
            $0.brushPinchPending = false
            $0.liveBoxLocal = nil
            $0.lassoLive = nil
        }
    }

    func setBrushRadius(_ r: Float) {
        let clamped = max(Self.minBrushRadius, min(Self.maxBrushRadius, r))
        editLock.withLock { $0.brushRadius = clamped }
    }

    // MARK: - M5.1 Undo / redo

    /// Captures the current undoable surface of `EditState`. Caller MUST
    /// hold `editLock` already.
    private static func snapshot(_ state: EditState) -> HistorySnapshot {
        HistorySnapshot(
            transform: state.transform,
            hasUserAdjusted: state.hasUserAdjusted,
            pendingWaypoints: state.pendingWaypoints,
            yawUpdates: state.yawUpdates,
            pendingDeletionSpheres: state.pendingDeletionSpheres,
            pendingDeletionBoxes: state.pendingDeletionBoxes,
            pendingDeletionLassos: state.pendingDeletionLassos,
            pendingHotspots: state.pendingHotspots,
            selectedPendingHotspotId: state.selectedPendingHotspotId,
            pendingComments: state.pendingComments,
            selectedPendingCommentId: state.selectedPendingCommentId
        )
    }

    /// Apply `snap` onto `state`. Caller MUST hold `editLock`.
    private static func restore(_ snap: HistorySnapshot, into state: inout EditState) {
        state.transform = snap.transform
        state.hasUserAdjusted = snap.hasUserAdjusted
        state.pendingWaypoints = snap.pendingWaypoints
        state.yawUpdates = snap.yawUpdates
        state.pendingDeletionSpheres = snap.pendingDeletionSpheres
        state.pendingDeletionBoxes = snap.pendingDeletionBoxes
        state.pendingDeletionLassos = snap.pendingDeletionLassos
        state.pendingHotspots = snap.pendingHotspots
        state.selectedPendingHotspotId = snap.selectedPendingHotspotId
        state.pendingComments = snap.pendingComments
        state.selectedPendingCommentId = snap.selectedPendingCommentId
    }

    /// Push a pre-mutation snapshot onto `undoStack` and clear `redoStack`.
    /// Call from inside an `editLock.withLock` closure BEFORE mutating the
    /// committed surface. New commits invalidate any redo trail.
    private static func recordHistory(_ state: inout EditState) {
        let snap = snapshot(state)
        state.undoStack.append(snap)
        if state.undoStack.count > undoStackCap {
            state.undoStack.removeFirst(state.undoStack.count - undoStackCap)
        }
        state.redoStack.removeAll(keepingCapacity: true)
    }

    /// Public undo. Returns true if a step was reverted.
    @discardableResult
    func undo() -> Bool {
        editLock.withLock { state in
            guard let prev = state.undoStack.popLast() else { return false }
            state.redoStack.append(Self.snapshot(state))
            Self.restore(prev, into: &state)
            return true
        }
    }

    /// Public redo. Returns true if a step was re-applied.
    @discardableResult
    func redo() -> Bool {
        editLock.withLock { state in
            guard let next = state.redoStack.popLast() else { return false }
            state.undoStack.append(Self.snapshot(state))
            Self.restore(next, into: &state)
            return true
        }
    }

    func historyDepth() -> (undo: Int, redo: Int) {
        editLock.withLock { ($0.undoStack.count, $0.redoStack.count) }
    }

    /// M6.6 — read the latest perf snapshot. Always cheap; safe for the
    /// SwiftUI 4 Hz refresh loop.
    func snapshotPerfCounters() -> (fps: Double, markers: Int, drawables: Int, splatPoints: Int) {
        perfLock.withLock {
            ($0.lastFps, $0.lastMarkerCount, $0.lastDrawableCount, $0.splatPointCount)
        }
    }

    /// M5.11 — flip on/off renderer-side overlays (waypoints, pending
    /// deletion volumes, calibration silhouette). Reads on each frame in
    /// `buildMarkers`. Persistence is per-session only.
    func setDisplayFlags(
        hideWaypoints: Bool,
        hidePendingDeletions: Bool,
        hideSilhouette: Bool,
        hideReticle: Bool = false
    ) {
        editLock.withLock {
            $0.hideWaypoints = hideWaypoints
            $0.hidePendingDeletions = hidePendingDeletions
            $0.hideSilhouette = hideSilhouette
            $0.hideReticle = hideReticle
        }
    }

    /// Simulator-only: injects a pinch event as if the user had tapped their
    /// fingers together. The render loop will treat it identically to a real
    /// hand-tracked pinch and dolly forward on the next frame.
    static func debugTriggerPinch() {
        currentRenderer?.stateLock.withLock { $0.pinchPending = true }
    }

    /// M6.11 simulator-only: commit a small synthetic box volume for
    /// deletion (10 cm cube centred at splat-local origin). Skips the real
    /// dual-pinch gesture state machine; we go straight to the same code
    /// path that the gesture-release branch takes after a successful box.
    static func debugTriggerBoxCommit() {
        currentRenderer?.editLock.withLock { state in
            Self.recordHistory(&state)
            state.pendingDeletionBoxes.append(DeletionBox(
                min: [-0.05, -0.05, -0.05],
                max: [0.05, 0.05, 0.05]
            ))
            state.liveBoxLocal = nil
        }
    }

    /// M6.11 simulator-only: commit a small synthetic lasso polygon (a
    /// 10 cm square in the splat XY plane). Same shortcut as box — bypass
    /// the gesture-state machine and inject the post-release shape.
    static func debugTriggerLassoCommit() {
        currentRenderer?.editLock.withLock { state in
            Self.recordHistory(&state)
            // Plane: Z = 0 → normal (0, 0, 1), d = 0.
            state.pendingDeletionLassos.append(DeletionLasso(
                plane: [0, 0, 1, 0],
                polygon: [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]]
            ))
            state.lassoLive = nil
        }
    }

    private func setupReticle() {
        do {
            self.reticleRenderer = try ReticleRenderer(
                device: device,
                colorFormat: layerRenderer.configuration.colorFormat,
                depthFormat: layerRenderer.configuration.depthFormat,
                sampleCount: 1,
                maxViewCount: layerRenderer.properties.viewCount,
                maxMarkers: Self.maxMarkersPerFrame,
                maxSimultaneousRenders: Self.maxSimultaneousRenders
            )
        } catch {
            Self.log.error("Failed to init reticle renderer: \(error.localizedDescription)")
            self.reticleRenderer = nil
        }
    }

    static func startRendering(_ layerRenderer: LayerRenderer, session: SplatSession) {
        // Fast init: grabs device + command queue only. Heavy work happens
        // inside the Task so the UI (including the Cancel button) stays
        // responsive during load.
        let renderer = SplatImmersiveRenderer(layerRenderer, session: session)
        let url = session.url
        Task {
            renderer.setupReticle()

            await MainActor.run { SplatLoadState.shared.set(.loading) }

            do {
                try await renderer.load(url: url)
                if await isCancelled() { return }
                await MainActor.run { SplatLoadState.shared.set(.ready) }
            } catch {
                if await isCancelled() { return }
                log.error("Failed to load splat at \(url.lastPathComponent): \(error.localizedDescription)")
                let message = error.localizedDescription
                await MainActor.run { SplatLoadState.shared.set(.failed(message)) }
            }

            if await isCancelled() { return }
            renderer.startRenderLoop()
        }
    }

    /// Returns true if the user has exited the immersive space (phase == .idle)
    /// while the renderer is mid-load. Used to short-circuit state updates and
    /// render-loop startup after a cancel.
    private static func isCancelled() async -> Bool {
        await MainActor.run { SplatLoadState.shared.phase == .idle }
    }

    private func load(url: URL) async throws {
        let splat = try SplatRenderer(
            device: device,
            colorFormat: layerRenderer.configuration.colorFormat,
            depthFormat: layerRenderer.configuration.depthFormat,
            sampleCount: 1,
            maxViewCount: layerRenderer.properties.viewCount,
            maxSimultaneousRenders: Self.maxSimultaneousRenders
        )
        let reader = try AutodetectSceneReader(url)
        let rawPoints = try await reader.readAll()
        // Apply persisted deletions at load time. Without a forked
        // MetalSplatter that supports a per-splat alpha mask, this is the
        // cheapest way to honour saved cleanup edits — drop the points
        // before they're chunked. Cost: O(N · (S + B + L)) where S/B/L =
        // number of committed deletion spheres / boxes / lassos.
        let deletions = session.sceneEdits?.deletions
        let points = Self.applyDeletions(
            points: rawPoints,
            spheres: deletions?.spheres ?? [],
            boxes: deletions?.boxes ?? [],
            lassos: deletions?.lassos ?? []
        )
        // Stash splat-local AABB BEFORE the chunk consumes the array — used
        // by snap-to-floor / snap-to-grid which run on the main thread.
        let computedAABB: AABB? = {
            guard let first = points.first else { return nil }
            var lo = first.position, hi = first.position
            for p in points.dropFirst() {
                lo = simd_min(lo, p.position)
                hi = simd_max(hi, p.position)
            }
            return AABB(lo: lo, hi: hi)
        }()
        if let computedAABB {
            aabbLock.withLock { $0 = computedAABB }
        }
        let pointsCountSnapshot = points.count
        perfLock.withLock { $0.splatPointCount = pointsCountSnapshot }
        let chunk = try SplatChunk(device: device, from: points)
        await splat.addChunk(chunk)
        splatRenderer = splat
    }

    /// M6.3 — snap the user's translation so the lowest face of the
    /// splat-local AABB lands on world y=0 under the current transform.
    /// No-op if AABB or splat hasn't loaded. Returns true if applied.
    @discardableResult
    func snapToFloor() -> Bool {
        guard let aabb = aabbLock.withLock({ $0 }) else { return false }
        editLock.withLock { state in
            let editMatrix = Self.editTransformMatrix(for: state.transform)
            // Up-axis flip applied in `splatModelMatrix` (rotate π around Z).
            // Replicate it here so we read the same world Y the renderer paints.
            let upFlip = matrix4x4_rotation(radians: .pi, axis: SIMD3<Float>(0, 0, 1))
            // 8 AABB corners → world; pick the lowest.
            let xs: [Float] = [aabb.lo.x, aabb.hi.x]
            let ys: [Float] = [aabb.lo.y, aabb.hi.y]
            let zs: [Float] = [aabb.lo.z, aabb.hi.z]
            var minY: Float = .infinity
            for x in xs { for y in ys { for z in zs {
                let local = SIMD4<Float>(x, y, z, 1)
                let world4 = upFlip * (editMatrix * local)
                if world4.y < minY { minY = world4.y }
            } } }
            // World minY is relative to the splat's pre-translation origin
            // because `editTransformMatrix` already includes translation.
            // Adjusting tx.y by -minY zeroes the lowest face.
            guard minY.isFinite else { return }
            Self.recordHistory(&state)
            state.transform = SceneTransform(
                scale: state.transform.scale,
                rotation: state.transform.rotation,
                translation: Position3D(
                    x: state.transform.translation.x,
                    y: state.transform.translation.y - Double(minY),
                    z: state.transform.translation.z
                )
            )
            state.hasUserAdjusted = true
            state.calibratePhase = .idle
        }
        return true
    }

    /// M6.3 — quantise the live translation to a 5 cm grid (configurable).
    /// Pushes onto undo so the user can revert with ⌘Z.
    @discardableResult
    func snapToGrid(spacingMeters: Double = 0.05) -> Bool {
        guard spacingMeters > 0 else { return false }
        editLock.withLock { state in
            let snap: (Double) -> Double = { v in
                (v / spacingMeters).rounded() * spacingMeters
            }
            let snapped = Position3D(
                x: snap(state.transform.translation.x),
                y: snap(state.transform.translation.y),
                z: snap(state.transform.translation.z)
            )
            if snapped == state.transform.translation { return }
            Self.recordHistory(&state)
            state.transform = SceneTransform(
                scale: state.transform.scale,
                rotation: state.transform.rotation,
                translation: snapped
            )
            state.hasUserAdjusted = true
            state.calibratePhase = .idle
        }
        return true
    }

    /// Filters splat points by every persisted deletion region: spheres,
    /// axis-aligned boxes, and lasso polygon-frustums. Returns unchanged if
    /// no deletions are recorded.
    ///
    /// `SplatScenePoint` from SplatIO exposes a `position` SIMD3<Float>
    /// field. If the upstream SplatIO type ever renames that property, the
    /// keypath read below will need to follow.
    private static func applyDeletions(
        points: [SplatScenePoint],
        spheres: [DeletionSphere],
        boxes: [DeletionBox],
        lassos: [DeletionLasso]
    ) -> [SplatScenePoint] {
        if spheres.isEmpty && boxes.isEmpty && lassos.isEmpty {
            return points
        }
        struct CompiledSphere {
            let center: SIMD3<Float>
            let radius2: Float
        }
        struct CompiledBox {
            let lo: SIMD3<Float>
            let hi: SIMD3<Float>
        }
        struct CompiledLasso {
            let normal: SIMD3<Float>
            let d: Float
            let right: SIMD3<Float>
            let up: SIMD3<Float>
            let polygon: [SIMD2<Float>]
            let planePoint: SIMD3<Float>
        }
        let compiledSpheres: [CompiledSphere] = spheres.map { s in
            CompiledSphere(
                center: SIMD3<Float>(Float(s.center[0]), Float(s.center[1]), Float(s.center[2])),
                radius2: Float(s.radius * s.radius)
            )
        }
        let compiledBoxes: [CompiledBox] = boxes.map { b in
            CompiledBox(
                lo: SIMD3<Float>(Float(b.min[0]), Float(b.min[1]), Float(b.min[2])),
                hi: SIMD3<Float>(Float(b.max[0]), Float(b.max[1]), Float(b.max[2]))
            )
        }
        let compiledLassos: [CompiledLasso] = lassos.compactMap { l in
            guard l.plane.count == 4, l.polygon.count >= 3 else { return nil }
            let n = SIMD3<Float>(Float(l.plane[0]), Float(l.plane[1]), Float(l.plane[2]))
            let nLen2 = max(dot(n, n), 1e-6)
            let planePoint = -Float(l.plane[3]) / nLen2 * n
            let upGuess = abs(n.y) < 0.9 ? SIMD3<Float>(0, 1, 0) : SIMD3<Float>(1, 0, 0)
            let right = normalize(cross(upGuess, n))
            let up = normalize(cross(n, right))
            let polygon: [SIMD2<Float>] = l.polygon.compactMap { uv in
                guard uv.count >= 2 else { return nil }
                return SIMD2<Float>(Float(uv[0]), Float(uv[1]))
            }
            return CompiledLasso(
                normal: normalize(n),
                d: Float(l.plane[3]),
                right: right,
                up: up,
                polygon: polygon,
                planePoint: planePoint
            )
        }
        return points.filter { point in
            let p = point.position
            for sphere in compiledSpheres {
                let d = p - sphere.center
                if dot(d, d) < sphere.radius2 { return false }
            }
            for box in compiledBoxes {
                if p.x >= box.lo.x && p.x <= box.hi.x
                    && p.y >= box.lo.y && p.y <= box.hi.y
                    && p.z >= box.lo.z && p.z <= box.hi.z {
                    return false
                }
            }
            for lasso in compiledLassos {
                // Project p onto plane, find UV against (right, up) basis,
                // then point-in-polygon. This effectively makes the lasso a
                // polygon-prism extruded along the plane's normal.
                let v = p - lasso.planePoint
                let u = dot(v, lasso.right)
                let w = dot(v, lasso.up)
                if Self.pointInPolygon(SIMD2<Float>(u, w), polygon: lasso.polygon) {
                    return false
                }
            }
            return true
        }
    }

    /// Standard ray-casting point-in-polygon test (Jordan curve theorem).
    /// Returns true if `p` is inside the polygon defined by `polygon`.
    private static func pointInPolygon(_ p: SIMD2<Float>, polygon: [SIMD2<Float>]) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let a = polygon[i]
            let b = polygon[j]
            if (a.y > p.y) != (b.y > p.y) {
                let t = (p.y - a.y) / (b.y - a.y)
                let xCross = a.x + t * (b.x - a.x)
                if p.x < xCross { inside.toggle() }
            }
            j = i
        }
        return inside
    }

    private func startRenderLoop() {
        Task(executorPreference: RendererTaskExecutor.shared) {
            // Hand tracking is not available in the visionOS Simulator — adding
            // it to the session there throws an ObjC exception that can't be
            // caught from Swift and crashes the process. Guard it.
            var providers: [any DataProvider] = [self.worldTracking]
            if HandTrackingProvider.isSupported {
                providers.append(self.handTracking)
            } else {
                Self.log.warning("Hand tracking unavailable — pinch navigation disabled (simulator?)")
            }

            do {
                try await self.arSession.run(providers)
            } catch {
                Self.log.error("Failed to start ARSession: \(error.localizedDescription)")
                return
            }

            if HandTrackingProvider.isSupported {
                self.launchHandTrackingConsumer()
            }
            self.renderLoop()
        }
    }

    private func launchHandTrackingConsumer() {
        Task.detached { [weak self] in
            guard let self else { return }
            for await update in self.handTracking.anchorUpdates {
                self.processHandUpdate(update.anchor)
            }
        }
    }

    private func processHandUpdate(_ anchor: HandAnchor) {
        let pinch = Self.pinchInfo(anchor: anchor)
        let activeTool = editLock.withLock { $0.activeTool }

        switch activeTool {
        case .view:
            stateLock.withLock { state in
                let wasPinched: Bool
                switch anchor.chirality {
                case .left:
                    wasPinched = state.leftPinched
                    state.leftPinched = pinch.isPinching
                case .right:
                    wasPinched = state.rightPinched
                    state.rightPinched = pinch.isPinching
                }
                if pinch.isPinching && !wasPinched {
                    state.pinchPending = true
                }
            }
        case .calibrate:
            editLock.withLock { state in
                switch anchor.chirality {
                case .left:
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
                Self.advanceCalibrate(state: &state)
            }
        case .waypoint:
            editLock.withLock { state in
                let wasPinched: Bool
                switch anchor.chirality {
                case .left:
                    wasPinched = state.leftWasPinched
                    state.leftWasPinched = pinch.isPinching
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    wasPinched = state.rightWasPinched
                    state.rightWasPinched = pinch.isPinching
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
                if pinch.isPinching && !wasPinched {
                    state.waypointPinchPending = true
                }
            }
        case .brush:
            editLock.withLock { state in
                let wasPinched: Bool
                switch anchor.chirality {
                case .left:
                    wasPinched = state.leftWasPinched
                    state.leftWasPinched = pinch.isPinching
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    wasPinched = state.rightWasPinched
                    state.rightWasPinched = pinch.isPinching
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
                if pinch.isPinching && !wasPinched {
                    state.brushPinchPending = true
                }
                // Live brush-sphere preview position: prefer right hand, fall
                // back to left, fall back to last-known. nil hides preview.
                state.brushPreviewWorldPos =
                    state.rightHandPos ?? state.leftHandPos ?? state.brushPreviewWorldPos
            }
        case .box, .lasso:
            // Both selection tools just need accurate per-hand pinch state;
            // their commit logic runs in `updateNavigation` once per frame
            // where the splat-local transform is also available.
            editLock.withLock { state in
                switch anchor.chirality {
                case .left:
                    state.leftWasPinched = pinch.isPinching
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    state.rightWasPinched = pinch.isPinching
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
            }
        case .hotspot:
            editLock.withLock { state in
                let wasPinched: Bool
                switch anchor.chirality {
                case .left:
                    wasPinched = state.leftWasPinched
                    state.leftWasPinched = pinch.isPinching
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    wasPinched = state.rightWasPinched
                    state.rightWasPinched = pinch.isPinching
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
                if pinch.isPinching && !wasPinched {
                    state.hotspotPinchPending = true
                }
            }
        case .comment:
            editLock.withLock { state in
                let wasPinched: Bool
                switch anchor.chirality {
                case .left:
                    wasPinched = state.leftWasPinched
                    state.leftWasPinched = pinch.isPinching
                    state.leftHandPos = pinch.isPinching ? pinch.position : nil
                case .right:
                    wasPinched = state.rightWasPinched
                    state.rightWasPinched = pinch.isPinching
                    state.rightHandPos = pinch.isPinching ? pinch.position : nil
                }
                if pinch.isPinching && !wasPinched {
                    state.commentPinchPending = true
                }
            }
        }
    }

    /// Updates `state.transform` and `state.calibratePhase` based on the
    /// current per-hand pinch positions. Called under `editLock`.
    ///
    /// Phase transitions (`none ↔ single ↔ dual`) re-baseline so that the
    /// last-known transform becomes the new gesture's starting point — the
    /// user can release one finger mid-gesture and continue with the other
    /// hand without a snap.
    private static func advanceCalibrate(state: inout EditState) {
        let leftPos = state.leftHandPos
        let rightPos = state.rightHandPos

        // Gesture continuation in the current phase, if both required hands
        // are still pinching.
        switch state.calibratePhase {
        case .single(let baseline, let initialHand):
            if let single = leftPos ?? rightPos, leftPos == nil || rightPos == nil {
                let delta = single - initialHand
                state.transform = baseline.applying(translationDelta: delta)
                state.hasUserAdjusted = true
                return
            }
        case .dual(let baseline, let initialLeft, let initialRight):
            if let l = leftPos, let r = rightPos {
                let initialMid = (initialLeft + initialRight) * 0.5
                let currentMid = (l + r) * 0.5
                let translationDelta = currentMid - initialMid

                let initialDist = length(initialRight - initialLeft)
                let currentDist = length(r - l)
                let safeInitial = max(initialDist, 0.001)
                let scaleMultiplier = max(0.05, currentDist / safeInitial)

                // Yaw around +Y from the projected (right - left) vector.
                let dxI = initialRight.x - initialLeft.x
                let dzI = initialRight.z - initialLeft.z
                let dxC = r.x - l.x
                let dzC = r.z - l.z
                let initialYaw = atan2(dxI, -dzI)
                let currentYaw = atan2(dxC, -dzC)
                let yawDelta = currentYaw - initialYaw

                state.transform = baseline.applying(
                    translationDelta: translationDelta,
                    scaleMultiplier: scaleMultiplier,
                    yawDelta: yawDelta
                )
                state.hasUserAdjusted = true
                return
            }
        case .idle:
            break
        }

        // Phase change — capture a new baseline against the latest transform.
        switch (leftPos, rightPos) {
        case (.none, .none):
            state.calibratePhase = .idle
        case (.some(let l), .some(let r)):
            state.calibratePhase = .dual(
                baseline: state.transform,
                initialLeft: l,
                initialRight: r
            )
        case (.some(let l), .none):
            state.calibratePhase = .single(baseline: state.transform, initialHand: l)
        case (.none, .some(let r)):
            state.calibratePhase = .single(baseline: state.transform, initialHand: r)
        }
    }

    private struct PinchInfo {
        let isPinching: Bool
        let position: SIMD3<Float>
    }

    private static func pinchInfo(anchor: HandAnchor) -> PinchInfo {
        guard anchor.isTracked, let skeleton = anchor.handSkeleton else {
            return PinchInfo(isPinching: false, position: .zero)
        }
        let thumbTip = skeleton.joint(.thumbTip)
        let indexTip = skeleton.joint(.indexFingerTip)
        guard thumbTip.isTracked, indexTip.isTracked else {
            return PinchInfo(isPinching: false, position: .zero)
        }

        let thumbWorld = anchor.originFromAnchorTransform * thumbTip.anchorFromJointTransform
        let indexWorld = anchor.originFromAnchorTransform * indexTip.anchorFromJointTransform

        let thumbPos = SIMD3<Float>(thumbWorld.columns.3.x, thumbWorld.columns.3.y, thumbWorld.columns.3.z)
        let indexPos = SIMD3<Float>(indexWorld.columns.3.x, indexWorld.columns.3.y, indexWorld.columns.3.z)

        return PinchInfo(
            isPinching: length(thumbPos - indexPos) < pinchThreshold,
            position: (thumbPos + indexPos) * 0.5
        )
    }

    private struct ViewportFrameData {
        let viewport: MTLViewport
        let projectionMatrix: matrix_float4x4
        let userViewpointMatrix: matrix_float4x4
        let splatViewMatrix: matrix_float4x4
        let screenSize: SIMD2<Int>
    }

    private func splatModelMatrix(viewerOffset: SIMD3<Float>) -> matrix_float4x4 {
        // Original splat placement: translate(0, 0, -2). With viewer offset,
        // we pre-multiply a translate(-viewerOffset) in world space, which
        // combines into a single translation.
        let translationMatrix = matrix4x4_translation(
            -viewerOffset.x,
            -viewerOffset.y,
            Self.modelCenterZ - viewerOffset.z
        )
        // Flip common PLY datasets right-side up.
        let commonUpCalibration = matrix4x4_rotation(radians: .pi, axis: SIMD3<Float>(0, 0, 1))
        // The user-calibrated transform is applied in splat-local space
        // (innermost), so scale+rotation happen around the splat origin
        // before the up-flip and world placement. Read live so the calibrate
        // tool's gesture updates show up on the next frame.
        let liveTransform = editLock.withLock { $0.transform }
        let editMatrix = Self.editTransformMatrix(for: liveTransform)
        return translationMatrix * commonUpCalibration * editMatrix
    }

    private func buildFrameData(
        drawable: LayerRenderer.Drawable,
        deviceAnchor: DeviceAnchor?,
        splatModelMatrix: matrix_float4x4
    ) -> [ViewportFrameData] {
        let simdDeviceAnchor = deviceAnchor?.originFromAnchorTransform ?? matrix_identity_float4x4

        return drawable.views.enumerated().map { (index, view) in
            let userViewpointMatrix = (simdDeviceAnchor * view.transform).inverse
            let projectionMatrix = drawable.computeProjection(viewIndex: index)
            let screenSize = SIMD2(x: Int(view.textureMap.viewport.width),
                                   y: Int(view.textureMap.viewport.height))
            return ViewportFrameData(
                viewport: view.textureMap.viewport,
                projectionMatrix: projectionMatrix,
                userViewpointMatrix: userViewpointMatrix,
                splatViewMatrix: userViewpointMatrix * splatModelMatrix,
                screenSize: screenSize
            )
        }
    }

    /// Returns world position of waypoint `wp` under the current
    /// `splatModelMatrix`, used for both rendering and aim hit-testing.
    private func waypointWorldPosition(_ wp: WaypointMarker,
                                       splatModelMatrix: matrix_float4x4) -> SIMD3<Float> {
        let local = SIMD4<Float>(wp.x, wp.y, wp.z, 1)
        let world = splatModelMatrix * local
        return SIMD3<Float>(world.x, world.y, world.z)
    }

    /// Picks the waypoint closest along the head-forward ray that lies within
    /// `waypointRadius * waypointHitRadiusMultiplier` of the ray. Returns
    /// `nil` if no waypoint is currently aimed at.
    private func aimedWaypoint(headPos: SIMD3<Float>,
                               forward: SIMD3<Float>,
                               splatModelMatrix: matrix_float4x4) -> WaypointMarker? {
        guard !waypoints.isEmpty else { return nil }
        let hitRadius = Self.waypointRadius * Self.waypointHitRadiusMultiplier
        var best: (proj: Float, marker: WaypointMarker)?
        for wp in waypoints {
            let worldPos = waypointWorldPosition(wp, splatModelMatrix: splatModelMatrix)
            let toWp = worldPos - headPos
            let proj = dot(toWp, forward)
            guard proj > 0, proj < Self.waypointMaxAimDistance else { continue }
            let perp = length(toWp - forward * proj)
            guard perp < hitRadius else { continue }
            if best == nil || proj < best!.proj {
                best = (proj, wp)
            }
        }
        return best?.marker
    }

    /// M6.1 — closest pending hotspot along the head-forward ray.
    private static func aimedPendingHotspot(
        headPos: SIMD3<Float>,
        forward: SIMD3<Float>,
        splatModelMatrix: matrix_float4x4,
        pending: [PendingHotspot]
    ) -> PendingHotspot? {
        guard !pending.isEmpty else { return nil }
        let hitRadius = SplatImmersiveRenderer.hotspotRadius * SplatImmersiveRenderer.waypointHitRadiusMultiplier
        var best: (proj: Float, hs: PendingHotspot)?
        for hs in pending {
            let local = SIMD4<Float>(hs.localPosition.x, hs.localPosition.y, hs.localPosition.z, 1)
            let world4 = splatModelMatrix * local
            let world = SIMD3<Float>(world4.x, world4.y, world4.z)
            let toHs = world - headPos
            let proj = dot(toHs, forward)
            guard proj > 0, proj < SplatImmersiveRenderer.waypointMaxAimDistance else { continue }
            let perp = length(toHs - forward * proj)
            guard perp < hitRadius else { continue }
            if best == nil || proj < best!.proj {
                best = (proj, hs)
            }
        }
        return best?.hs
    }

    /// M7.7 — closest pending comment along the head-forward ray.
    private static func aimedPendingComment(
        headPos: SIMD3<Float>,
        forward: SIMD3<Float>,
        splatModelMatrix: matrix_float4x4,
        pending: [PendingComment]
    ) -> PendingComment? {
        guard !pending.isEmpty else { return nil }
        let hitRadius = SplatImmersiveRenderer.commentRadius * SplatImmersiveRenderer.waypointHitRadiusMultiplier
        var best: (proj: Float, c: PendingComment)?
        for c in pending {
            let local = SIMD4<Float>(c.localPosition.x, c.localPosition.y, c.localPosition.z, 1)
            let world4 = splatModelMatrix * local
            let world = SIMD3<Float>(world4.x, world4.y, world4.z)
            let to = world - headPos
            let proj = dot(to, forward)
            guard proj > 0, proj < SplatImmersiveRenderer.waypointMaxAimDistance else { continue }
            let perp = length(to - forward * proj)
            guard perp < hitRadius else { continue }
            if best == nil || proj < best!.proj { best = (proj, c) }
        }
        return best?.c
    }

    /// M7.7 — closest committed comment along the head-forward ray. Used
    /// to switch the popover thread to the comment the user is aiming at.
    private func aimedCommittedComment(
        headPos: SIMD3<Float>,
        forward: SIMD3<Float>,
        splatModelMatrix: matrix_float4x4
    ) -> CommentMarker? {
        guard !comments.isEmpty else { return nil }
        let hitRadius = Self.commentRadius * Self.waypointHitRadiusMultiplier
        var best: (proj: Float, c: CommentMarker)?
        for c in comments {
            let local = SIMD4<Float>(c.x, c.y, c.z, 1)
            let world4 = splatModelMatrix * local
            let world = SIMD3<Float>(world4.x, world4.y, world4.z)
            let to = world - headPos
            let proj = dot(to, forward)
            guard proj > 0, proj < Self.waypointMaxAimDistance else { continue }
            let perp = length(to - forward * proj)
            guard perp < hitRadius else { continue }
            if best == nil || proj < best!.proj { best = (proj, c) }
        }
        return best?.c
    }

    /// Same hit-test as `aimedWaypoint` but against the in-session pending
    /// waypoint list. Returns the closest hit (by projection along forward).
    private static func aimedPending(
        headPos: SIMD3<Float>,
        forward: SIMD3<Float>,
        splatModelMatrix: matrix_float4x4,
        pending: [PendingWaypoint]
    ) -> PendingWaypoint? {
        guard !pending.isEmpty else { return nil }
        let hitRadius = Self.waypointRadius * Self.waypointHitRadiusMultiplier
        var best: (proj: Float, wp: PendingWaypoint)?
        for wp in pending {
            let local = SIMD4<Float>(wp.localPosition.x, wp.localPosition.y, wp.localPosition.z, 1)
            let world4 = splatModelMatrix * local
            let world = SIMD3<Float>(world4.x, world4.y, world4.z)
            let toWp = world - headPos
            let proj = dot(toWp, forward)
            guard proj > 0, proj < Self.waypointMaxAimDistance else { continue }
            let perp = length(toWp - forward * proj)
            guard perp < hitRadius else { continue }
            if best == nil || proj < best!.proj {
                best = (proj, wp)
            }
        }
        return best?.wp
    }

    /// Advances dolly animation, commits any pending pinch (teleporting if
    /// the pinch lands on a waypoint, otherwise dollying forward), and
    /// returns the current viewer offset + reticle world position + the
    /// currently-aimed waypoint (if any) + currently-aimed pending
    /// waypoint id (if any) for tinting.
    private func updateNavigation(
        deviceAnchor: DeviceAnchor?,
        time: TimeInterval
    ) -> (viewerOffset: SIMD3<Float>,
          reticleWorldPosition: SIMD3<Float>,
          aimedWaypointId: UUID?,
          aimedPendingId: UUID?,
          yawPreviewOrigin: SIMD3<Float>?,
          yawPreviewYaw: Float?) {
        let headTransform = deviceAnchor?.originFromAnchorTransform ?? matrix_identity_float4x4
        let headPos = SIMD3<Float>(headTransform.columns.3.x,
                                   headTransform.columns.3.y,
                                   headTransform.columns.3.z)
        // Forward = -Z column of the head transform
        let forwardRaw = SIMD3<Float>(-headTransform.columns.2.x,
                                      -headTransform.columns.2.y,
                                      -headTransform.columns.2.z)
        let forwardLen = length(forwardRaw)
        let forward = forwardLen > 0 ? (forwardRaw / forwardLen) : SIMD3<Float>(0, 0, -1)
        let reticlePos = headPos + forward * Self.reticleDistance
        // Yaw around +Y for arrival-pose capture. Same projection convention
        // as calibrate: atan2(forward.x, -forward.z) so 0 = facing -Z.
        let headYaw = atan2(forward.x, -forward.z)

        // Snapshot offset to compute the splat transform used for hit-testing.
        // Slightly stale during a dolly animation, but the user already aimed
        // by the time they pinched so this is fine.
        let preOffset = stateLock.withLock { $0.viewerOffset }
        let preSplatModel = splatModelMatrix(viewerOffset: preOffset)
        let aimed = aimedWaypoint(headPos: headPos,
                                  forward: forward,
                                  splatModelMatrix: preSplatModel)

        // Waypoint-tool pinch consumption: aim at existing committed waypoint
        // → record yaw update; aim at pending waypoint → record yaw on
        // pending; otherwise drop a new pending waypoint at reticle position
        // expressed in splat-local coordinates.
        let aimedPendingId: UUID? = editLock.withLock { state in
            guard state.activeTool == .waypoint else { return nil as UUID? }
            let aimedPending = Self.aimedPending(
                headPos: headPos,
                forward: forward,
                splatModelMatrix: preSplatModel,
                pending: state.pendingWaypoints
            )
            if state.waypointPinchPending {
                state.waypointPinchPending = false
                Self.recordHistory(&state)
                if let aimedPending {
                    if let idx = state.pendingWaypoints.firstIndex(where: { $0.id == aimedPending.id }) {
                        state.pendingWaypoints[idx].targetYaw = headYaw
                    }
                } else if let aimed {
                    state.yawUpdates[aimed.id] = headYaw
                } else {
                    let worldDrop = headPos + forward * Self.reticleDistance
                    let inverseSplat = preSplatModel.inverse
                    let local4 = inverseSplat * SIMD4<Float>(worldDrop.x, worldDrop.y, worldDrop.z, 1)
                    let local = SIMD3<Float>(local4.x, local4.y, local4.z)
                    state.pendingWaypoints.append(
                        PendingWaypoint(id: UUID(), localPosition: local, targetYaw: nil)
                    )
                }
            }
            return aimedPending?.id
        }

        // M6.1 — Hotspot-tool pinch consumption: aim at existing pending
        // hotspot → cycle content type + select; otherwise drop a new
        // pending hotspot at the reticle in splat-local space and select it.
        // Committed hotspots are not edited from the renderer in v1 — the
        // SwiftUI inspector handles those via direct PATCH (out of scope).
        editLock.withLock { state in
            guard state.activeTool == .hotspot, state.hotspotPinchPending else { return }
            state.hotspotPinchPending = false
            let aimedPendingHotspot = Self.aimedPendingHotspot(
                headPos: headPos,
                forward: forward,
                splatModelMatrix: preSplatModel,
                pending: state.pendingHotspots
            )
            Self.recordHistory(&state)
            if let aimedPendingHotspot,
               let idx = state.pendingHotspots.firstIndex(where: { $0.id == aimedPendingHotspot.id }) {
                state.pendingHotspots[idx].contentType = state.pendingHotspots[idx].contentType.nextInCycle()
                state.selectedPendingHotspotId = aimedPendingHotspot.id
            } else {
                let worldDrop = headPos + forward * Self.reticleDistance
                let inverseSplat = preSplatModel.inverse
                let local4 = inverseSplat * SIMD4<Float>(worldDrop.x, worldDrop.y, worldDrop.z, 1)
                let local = SIMD3<Float>(local4.x, local4.y, local4.z)
                let newId = UUID()
                let nextIndex = state.pendingHotspots.count + 1
                state.pendingHotspots.append(
                    PendingHotspot(
                        id: newId,
                        localPosition: local,
                        contentType: .text,
                        title: "Hotspot \(nextIndex)",
                        contentMarkdown: nil,
                        mediaUrl: nil
                    )
                )
                state.selectedPendingHotspotId = newId
            }
        }

        // M7.7 — Comment-tool pinch consumption: aim at a committed comment
        // marker → select it (SwiftUI thread popover queries its body+replies);
        // aim at a pending comment → re-select it; otherwise drop a new
        // pending comment at the reticle.
        let aimedCommittedCommentNow = aimedCommittedComment(
            headPos: headPos,
            forward: forward,
            splatModelMatrix: preSplatModel
        )
        editLock.withLock { state in
            guard state.activeTool == .comment, state.commentPinchPending else { return }
            state.commentPinchPending = false
            let aimedPendingCommentVal = Self.aimedPendingComment(
                headPos: headPos,
                forward: forward,
                splatModelMatrix: preSplatModel,
                pending: state.pendingComments
            )
            if let committed = aimedCommittedCommentNow {
                state.selectedCommittedCommentId = committed.id
                state.selectedPendingCommentId = nil
            } else if let aimedPendingCommentVal {
                state.selectedPendingCommentId = aimedPendingCommentVal.id
                state.selectedCommittedCommentId = nil
            } else {
                Self.recordHistory(&state)
                let worldDrop = headPos + forward * Self.reticleDistance
                let inverseSplat = preSplatModel.inverse
                let local4 = inverseSplat * SIMD4<Float>(worldDrop.x, worldDrop.y, worldDrop.z, 1)
                let local = SIMD3<Float>(local4.x, local4.y, local4.z)
                let newId = UUID()
                state.pendingComments.append(
                    PendingComment(id: newId, localPosition: local, body: "")
                )
                state.selectedPendingCommentId = newId
                state.selectedCommittedCommentId = nil
            }
        }

        // Brush-tool pinch consumption: rising-edge pinch records a deletion
        // sphere at the hand position transformed into splat-local space.
        // Radius is divided by the calibrated scale so the world-space brush
        // size remains consistent regardless of how the user calibrated.
        editLock.withLock { state in
            guard state.activeTool == .brush, state.brushPinchPending else { return }
            state.brushPinchPending = false
            // Prefer the actual pinching hand position; fall back to reticle
            // if neither hand is currently available.
            let worldDrop = state.rightHandPos ?? state.leftHandPos ?? (headPos + forward * Self.reticleDistance)
            let inverseSplat = preSplatModel.inverse
            let local4 = inverseSplat * SIMD4<Float>(worldDrop.x, worldDrop.y, worldDrop.z, 1)
            let localCenter: [Double] = [Double(local4.x), Double(local4.y), Double(local4.z)]
            let calibratedScale = max(Float(state.transform.scale), 0.001)
            let localRadius = Double(state.brushRadius / calibratedScale)
            Self.recordHistory(&state)
            state.pendingDeletionSpheres.append(
                DeletionSphere(center: localCenter, radius: localRadius)
            )
        }

        // Box-tool: while both hands are pinching, maintain the AABB defined
        // by their splat-local positions. On dual-pinch release, commit it.
        editLock.withLock { state in
            guard state.activeTool == .box else { return }
            let inv = preSplatModel.inverse
            if let l = state.leftHandPos, let r = state.rightHandPos {
                let l4 = inv * SIMD4<Float>(l.x, l.y, l.z, 1)
                let r4 = inv * SIMD4<Float>(r.x, r.y, r.z, 1)
                let lA = SIMD3<Float>(l4.x, l4.y, l4.z)
                let rA = SIMD3<Float>(r4.x, r4.y, r4.z)
                state.liveBoxLocal = (simd_min(lA, rA), simd_max(lA, rA))
            } else if let live = state.liveBoxLocal {
                // Released → commit if the box has non-zero volume.
                let extent = live.hi - live.lo
                if extent.x * extent.y * extent.z > 1e-6 {
                    Self.recordHistory(&state)
                    state.pendingDeletionBoxes.append(DeletionBox(
                        min: [Double(live.lo.x), Double(live.lo.y), Double(live.lo.z)],
                        max: [Double(live.hi.x), Double(live.hi.y), Double(live.hi.z)]
                    ))
                }
                state.liveBoxLocal = nil
            }
        }

        // Lasso-tool: while pinching one hand, sample the hand position into
        // the polyline. On release, commit the polygon projected onto the
        // gaze plane captured at first sample.
        editLock.withLock { state in
            guard state.activeTool == .lasso else { return }
            let inv = preSplatModel.inverse
            let activeHand = state.rightHandPos ?? state.leftHandPos
            if let world = activeHand {
                let s4 = inv * SIMD4<Float>(world.x, world.y, world.z, 1)
                let localSample = SIMD3<Float>(s4.x, s4.y, s4.z)
                if state.lassoLive == nil {
                    // First sample: capture the gaze plane in splat-local.
                    let fwd4 = inv * SIMD4<Float>(forward.x, forward.y, forward.z, 0)
                    let up4 = inv * SIMD4<Float>(0, 1, 0, 0)
                    let normalRaw = SIMD3<Float>(fwd4.x, fwd4.y, fwd4.z)
                    let upRaw = SIMD3<Float>(up4.x, up4.y, up4.z)
                    let normal = (length(normalRaw) > 0) ? normalize(normalRaw) : SIMD3<Float>(0, 0, -1)
                    let upGuess = (length(upRaw) > 0) ? normalize(upRaw) : SIMD3<Float>(0, 1, 0)
                    let right = normalize(cross(upGuess, normal))
                    let upOrth = normalize(cross(normal, right))
                    state.lassoLive = LassoLiveState(
                        samples: [localSample],
                        planeNormalLocal: normal,
                        planeUpLocal: upOrth,
                        planeRightLocal: right,
                        planePointLocal: localSample
                    )
                } else if let last = state.lassoLive!.samples.last,
                          length(localSample - last) > 0.01 {
                    state.lassoLive!.samples.append(localSample)
                }
            } else if let live = state.lassoLive {
                // Pinch released → commit lasso if at least a triangle.
                if live.samples.count >= 3 {
                    let n = live.planeNormalLocal
                    let d = -dot(n, live.planePointLocal)
                    let polygonUV: [[Double]] = live.samples.map { s in
                        let v = s - live.planePointLocal
                        return [
                            Double(dot(v, live.planeRightLocal)),
                            Double(dot(v, live.planeUpLocal))
                        ]
                    }
                    Self.recordHistory(&state)
                    state.pendingDeletionLassos.append(DeletionLasso(
                        plane: [Double(n.x), Double(n.y), Double(n.z), Double(d)],
                        polygon: polygonUV
                    ))
                }
                state.lassoLive = nil
            }
        }

        let viewerOffset: SIMD3<Float> = stateLock.withLock { state in
            if state.pinchPending {
                state.pinchPending = false
                if let aimed {
                    if aimed.targetSceneId == session.sceneId {
                        // Same-scene teleport: dolly the user to the
                        // waypoint's recorded arrival position (or the
                        // waypoint's own world position as a fallback when
                        // no arrival pose was set).
                        let arrivalLocal = aimed.targetPosition ?? aimed.position
                        let local = SIMD4<Float>(arrivalLocal.x, arrivalLocal.y, arrivalLocal.z, 1)
                        let arrivalWorld = preSplatModel * local
                        state.dollyStart = state.viewerOffset
                        state.dollyTarget = state.viewerOffset + SIMD3<Float>(arrivalWorld.x, arrivalWorld.y, arrivalWorld.z) - headPos
                        state.dollyStartTime = time
                    } else {
                        // Cross-scene: hand off to SwiftUI to dismiss + re-open
                        // the immersive space against the target scene's splat.
                        let target = aimed.targetSceneId
                        Task { @MainActor in
                            WaypointSelectionState.shared.select(targetSceneId: target)
                        }
                    }
                } else {
                    state.dollyStart = state.viewerOffset
                    state.dollyTarget = state.viewerOffset + forward * Self.reticleDistance
                    state.dollyStartTime = time
                }
            }

            if state.dollyStartTime >= 0 {
                let elapsed = time - state.dollyStartTime
                let t = Float(min(1.0, max(0.0, elapsed / Self.dollyDuration)))
                // Ease-out cubic: 1 - (1 - t)^3
                let eased = 1 - pow(1 - t, 3)
                state.viewerOffset = state.dollyStart + (state.dollyTarget - state.dollyStart) * eased
                if t >= 1.0 {
                    state.dollyStartTime = -1
                    state.viewerOffset = state.dollyTarget
                }
            }

            return state.viewerOffset
        }

        // M6.5 — arrival-yaw preview arrow. Only meaningful while the
        // waypoint tool is active AND the user is aimed at an existing or
        // pending waypoint; in that case we expose the world origin (the
        // waypoint's world position) plus the candidate yaw (current head
        // yaw) so buildMarkers can draw a translucent arrow before pinch.
        var yawPreviewOrigin: SIMD3<Float>? = nil
        var yawPreviewYaw: Float? = nil
        let activeToolNow = editLock.withLock { $0.activeTool }
        if activeToolNow == .waypoint {
            if let aimed {
                yawPreviewOrigin = waypointWorldPosition(aimed, splatModelMatrix: preSplatModel)
                yawPreviewYaw = headYaw
            } else if let aimedPendingId,
                      let pending = editLock.withLock({
                          $0.pendingWaypoints.first(where: { $0.id == aimedPendingId })
                      }) {
                let local = SIMD4<Float>(pending.localPosition.x, pending.localPosition.y, pending.localPosition.z, 1)
                let world4 = preSplatModel * local
                yawPreviewOrigin = SIMD3<Float>(world4.x, world4.y, world4.z)
                yawPreviewYaw = headYaw
            }
        }

        return (viewerOffset, reticlePos, aimed?.id, aimedPendingId, yawPreviewOrigin, yawPreviewYaw)
    }

    /// Builds the marker list passed to `ReticleRenderer.render`: the
    /// reticle first, then each waypoint with its color tinted to indicate
    /// the currently-aimed waypoint, then (when calibrating) a 1.7 m human
    /// silhouette as a fixed-world reference, and (when brushing) all
    /// committed + pending deletion spheres + a live brush preview.
    private func buildMarkers(
        splatModelMatrix: matrix_float4x4,
        reticleWorldPosition: SIMD3<Float>,
        aimedWaypointId: UUID?,
        aimedPendingId: UUID?,
        pendingWaypoints: [PendingWaypoint],
        pendingDeletionSpheres: [DeletionSphere],
        pendingDeletionBoxes: [DeletionBox],
        pendingDeletionLassos: [DeletionLasso],
        liveBoxLocal: (lo: SIMD3<Float>, hi: SIMD3<Float>)?,
        liveLasso: LassoLiveState?,
        brushRadius: Float,
        brushPreviewWorldPos: SIMD3<Float>?,
        activeTool: ToolMode,
        pendingHotspots: [PendingHotspot] = [],
        selectedPendingHotspotId: UUID? = nil,
        pendingComments: [PendingComment] = [],
        selectedPendingCommentId: UUID? = nil,
        selectedCommittedCommentId: UUID? = nil,
        yawPreviewOrigin: SIMD3<Float>? = nil,
        yawPreviewYaw: Float? = nil,
        hideWaypoints: Bool = false,
        hidePendingDeletions: Bool = false,
        hideSilhouette: Bool = false,
        hideReticle: Bool = false
    ) -> [ReticleRenderer.Marker] {
        var markers: [ReticleRenderer.Marker] = []
        markers.reserveCapacity(1 + waypoints.count + pendingWaypoints.count + 5)
        if !hideReticle {
            markers.append(ReticleRenderer.Marker(
                worldPosition: reticleWorldPosition,
                radius: Self.reticleRadius,
                color: Self.reticleColor
            ))
        }
        if !hideWaypoints {
            for wp in waypoints {
                let worldPos = waypointWorldPosition(wp, splatModelMatrix: splatModelMatrix)
                let aimed = (wp.id == aimedWaypointId)
                markers.append(ReticleRenderer.Marker(
                    worldPosition: worldPos,
                    radius: Self.waypointRadius,
                    color: aimed ? Self.waypointAimedColor : Self.waypointColor
                ))
            }
            for wp in pendingWaypoints {
                let local = SIMD4<Float>(wp.localPosition.x, wp.localPosition.y, wp.localPosition.z, 1)
                let world4 = splatModelMatrix * local
                let aimed = (wp.id == aimedPendingId)
                markers.append(ReticleRenderer.Marker(
                    worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                    radius: Self.waypointRadius,
                    color: aimed ? Self.pendingWaypointAimedColor : Self.pendingWaypointColor
                ))
            }
        }
        // M6.1 — committed + pending hotspots. Always visible (no separate
        // toggle; the user expects content markers to persist across modes).
        for hs in hotspots {
            let local = SIMD4<Float>(hs.x, hs.y, hs.z, 1)
            let world4 = splatModelMatrix * local
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: Self.hotspotRadius,
                color: Self.hotspotColor
            ))
        }
        for hs in pendingHotspots {
            let local = SIMD4<Float>(hs.localPosition.x, hs.localPosition.y, hs.localPosition.z, 1)
            let world4 = splatModelMatrix * local
            let selected = (hs.id == selectedPendingHotspotId)
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: Self.hotspotRadius,
                color: selected ? Self.pendingHotspotSelectedColor : Self.pendingHotspotColor
            ))
        }
        // M7.6 — peer-editor aim cones. Read once per frame from the lock
        // so concurrent Realtime updates don't tear the marker list.
        let peerAims = peerAimsLock.withLock { $0 }
        for aim in peerAims {
            let local = SIMD4<Float>(aim.x, aim.y, aim.z, 1)
            let world4 = splatModelMatrix * local
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: Self.peerAimRadius,
                color: Self.peerAimColor
            ))
        }
        // M7.7 — committed + pending comments.
        for c in comments {
            let local = SIMD4<Float>(c.x, c.y, c.z, 1)
            let world4 = splatModelMatrix * local
            let selected = (c.id == selectedCommittedCommentId)
            let baseColor = c.resolved ? Self.commentResolvedColor : Self.commentColor
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: Self.commentRadius,
                color: selected ? Self.commentAimedColor : baseColor
            ))
        }
        for c in pendingComments {
            let local = SIMD4<Float>(c.localPosition.x, c.localPosition.y, c.localPosition.z, 1)
            let world4 = splatModelMatrix * local
            let selected = (c.id == selectedPendingCommentId)
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: Self.commentRadius,
                color: selected ? Self.pendingCommentSelectedColor : Self.pendingCommentColor
            ))
        }
        if activeTool == .calibrate {
            // M6.4 — XYZ axis gizmo at splat origin. ReticleRenderer only
            // knows spheres, so axes are 6 small spheres along each axis
            // (3 per axis, exponentially-spaced). Always shown in calibrate
            // mode, irrespective of the silhouette toggle, since they're a
            // separate orientation cue.
            let gizmoLocalLengths: [Float] = [0.10, 0.22, 0.40]
            let axes: [(SIMD3<Float>, SIMD4<Float>)] = [
                (SIMD3<Float>(1, 0, 0), SIMD4<Float>(1.0, 0.30, 0.30, 0.85)), // X red
                (SIMD3<Float>(0, 1, 0), SIMD4<Float>(0.35, 1.0, 0.40, 0.85)), // Y green
                (SIMD3<Float>(0, 0, 1), SIMD4<Float>(0.40, 0.55, 1.0, 0.85)), // Z blue
            ]
            for (dir, color) in axes {
                for d in gizmoLocalLengths {
                    let local = SIMD4<Float>(dir * d, 1)
                    let world4 = splatModelMatrix * local
                    markers.append(ReticleRenderer.Marker(
                        worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                        radius: 0.022,
                        color: color
                    ))
                }
            }
            // White origin sphere so the user sees where the axes converge.
            let origin4 = splatModelMatrix * SIMD4<Float>(0, 0, 0, 1)
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(origin4.x, origin4.y, origin4.z),
                radius: 0.030,
                color: SIMD4<Float>(1, 1, 1, 0.95)
            ))
        }
        if activeTool == .calibrate, !hideSilhouette {
            // 5-sphere stick-figure: head, shoulders, waist, hip, feet —
            // total height 1.70 m so the user can match in-splat humans
            // and door frames against it during scale calibration.
            let x = Self.silhouetteAnchorX
            let z = Self.silhouetteAnchorZ
            let parts: [(y: Float, r: Float)] = [
                (1.65, 0.10),  // head
                (1.40, 0.18),  // shoulders
                (1.00, 0.15),  // waist
                (0.50, 0.13),  // hip
                (0.10, 0.10),  // feet
            ]
            for part in parts {
                markers.append(ReticleRenderer.Marker(
                    worldPosition: SIMD3<Float>(x, part.y, z),
                    radius: part.r,
                    color: Self.silhouetteColor
                ))
            }
        }
        // Committed (already-saved) deletion spheres — show what's been
        // already removed via earlier sessions. Drawn from session.sceneEdits
        // so the user sees them even when not in brush mode.
        if let saved = session.sceneEdits?.deletions.spheres {
            for sphere in saved {
                let local = SIMD4<Float>(
                    Float(sphere.center[0]),
                    Float(sphere.center[1]),
                    Float(sphere.center[2]),
                    1
                )
                let world4 = splatModelMatrix * local
                let scaleFactor = max(Float(session.sceneEdits?.transform.scale ?? 1.0), 0.001)
                markers.append(ReticleRenderer.Marker(
                    worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                    radius: Float(sphere.radius) * scaleFactor,
                    color: Self.committedDeletionColor
                ))
            }
        }
        // Pending (this-session) deletion spheres — only shown while the
        // selection tools are active, so the view stays clean outside of
        // cleanup work.
        let inSelectionMode = (activeTool == .brush || activeTool == .box || activeTool == .lasso)
        let liveScale = max(Float(editLock.withLock { $0.transform.scale }), 0.001)
        if inSelectionMode, !hidePendingDeletions {
            for sphere in pendingDeletionSpheres {
                let local = SIMD4<Float>(
                    Float(sphere.center[0]),
                    Float(sphere.center[1]),
                    Float(sphere.center[2]),
                    1
                )
                let world4 = splatModelMatrix * local
                markers.append(ReticleRenderer.Marker(
                    worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                    radius: Float(sphere.radius) * liveScale,
                    color: Self.pendingDeletionColor
                ))
            }

            // Pending boxes: draw 8 corner spheres so the AABB is visible.
            for box in pendingDeletionBoxes {
                Self.appendBoxCorners(
                    markers: &markers,
                    lo: SIMD3<Float>(Float(box.min[0]), Float(box.min[1]), Float(box.min[2])),
                    hi: SIMD3<Float>(Float(box.max[0]), Float(box.max[1]), Float(box.max[2])),
                    splatModelMatrix: splatModelMatrix,
                    color: Self.pendingDeletionColor
                )
            }

            // Pending lassos: draw a sphere at each polyline sample.
            for lasso in pendingDeletionLassos {
                Self.appendLassoSamples(
                    markers: &markers,
                    lasso: lasso,
                    splatModelMatrix: splatModelMatrix,
                    color: Self.pendingDeletionColor
                )
            }
        }

        // Live previews — only render the active tool's gesture overlay.
        switch activeTool {
        case .brush:
            if let pos = brushPreviewWorldPos {
                markers.append(ReticleRenderer.Marker(
                    worldPosition: pos,
                    radius: brushRadius,
                    color: Self.brushPreviewColor
                ))
            }
        case .box:
            if let live = liveBoxLocal {
                Self.appendBoxCorners(
                    markers: &markers,
                    lo: live.lo,
                    hi: live.hi,
                    splatModelMatrix: splatModelMatrix,
                    color: Self.brushPreviewColor
                )
            }
        case .lasso:
            if let live = liveLasso {
                // Outline samples (existing).
                for sample in live.samples {
                    let local = SIMD4<Float>(sample.x, sample.y, sample.z, 1)
                    let world4 = splatModelMatrix * local
                    markers.append(ReticleRenderer.Marker(
                        worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                        radius: 0.018,
                        color: Self.brushPreviewColor
                    ))
                }
                // M6.9 — projection-cone preview. Reticle only knows
                // spheres so the "cone" is the lasso polyline shifted along
                // the splat-local plane normal at a few discrete depths.
                // The user reads the stack of outlines as the volume that
                // will be erased on release.
                let coneDepths: [Float] = [-0.45, -0.22, 0.22, 0.45]
                let coneColor = SIMD4<Float>(
                    Self.brushPreviewColor.x,
                    Self.brushPreviewColor.y,
                    Self.brushPreviewColor.z,
                    0.18
                )
                for depth in coneDepths {
                    for sample in live.samples {
                        let shifted = sample + live.planeNormalLocal * depth
                        let local = SIMD4<Float>(shifted.x, shifted.y, shifted.z, 1)
                        let world4 = splatModelMatrix * local
                        markers.append(ReticleRenderer.Marker(
                            worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                            radius: 0.012,
                            color: coneColor
                        ))
                    }
                }
            }
        case .view, .calibrate, .waypoint, .hotspot, .comment:
            break
        }
        // M6.5 — arrival-yaw preview arrow at the aimed waypoint. Stack of
        // small spheres along the candidate yaw direction (world XZ plane,
        // matching the calibrate yaw convention: 0 = facing -Z).
        if activeTool == .waypoint, let origin = yawPreviewOrigin, let yaw = yawPreviewYaw {
            let dir = SIMD3<Float>(sin(yaw), 0, -cos(yaw))
            let tipColor = SIMD4<Float>(1.0, 0.85, 0.30, 0.80)
            let trailColor = SIMD4<Float>(1.0, 0.78, 0.30, 0.45)
            let lengths: [Float] = [0.10, 0.20, 0.32, 0.46]
            for (idx, d) in lengths.enumerated() {
                let pos = origin + dir * d
                markers.append(ReticleRenderer.Marker(
                    worldPosition: pos,
                    radius: idx == lengths.count - 1 ? 0.045 : 0.025,
                    color: idx == lengths.count - 1 ? tipColor : trailColor
                ))
            }
        }
        return markers
    }

    /// Eight AABB corners as small spheres — the cheapest readable wireframe
    /// approximation given that ReticleRenderer only knows how to draw spheres.
    private static func appendBoxCorners(
        markers: inout [ReticleRenderer.Marker],
        lo: SIMD3<Float>,
        hi: SIMD3<Float>,
        splatModelMatrix: matrix_float4x4,
        color: SIMD4<Float>
    ) {
        let xs: [Float] = [lo.x, hi.x]
        let ys: [Float] = [lo.y, hi.y]
        let zs: [Float] = [lo.z, hi.z]
        for x in xs { for y in ys { for z in zs {
            let world4 = splatModelMatrix * SIMD4<Float>(x, y, z, 1)
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: 0.025,
                color: color
            ))
        }}}
    }

    /// Render committed lasso polygon samples by reconstructing world points
    /// from `polygon` UV coords + plane basis. We don't store the raw 3D
    /// samples on commit (the persisted shape is plane + 2D polygon), so we
    /// rebuild splat-local points from `polygon` and the plane.
    private static func appendLassoSamples(
        markers: inout [ReticleRenderer.Marker],
        lasso: DeletionLasso,
        splatModelMatrix: matrix_float4x4,
        color: SIMD4<Float>
    ) {
        guard lasso.plane.count == 4 else { return }
        let n = SIMD3<Float>(Float(lasso.plane[0]), Float(lasso.plane[1]), Float(lasso.plane[2]))
        let d = Float(lasso.plane[3])
        // Plane point: closest to origin = -d * n / |n|^2
        let nLen2 = max(dot(n, n), 1e-6)
        let planePoint = -d / nLen2 * n
        // Recover an arbitrary plane basis (right, up) from the normal.
        let upGuess = abs(n.y) < 0.9 ? SIMD3<Float>(0, 1, 0) : SIMD3<Float>(1, 0, 0)
        let right = normalize(cross(upGuess, n))
        let up = normalize(cross(n, right))
        for uv in lasso.polygon {
            guard uv.count >= 2 else { continue }
            let u = Float(uv[0])
            let v = Float(uv[1])
            let local = planePoint + right * u + up * v
            let world4 = splatModelMatrix * SIMD4<Float>(local.x, local.y, local.z, 1)
            markers.append(ReticleRenderer.Marker(
                worldPosition: SIMD3<Float>(world4.x, world4.y, world4.z),
                radius: 0.018,
                color: color
            ))
        }
    }

    private func renderFrame() {
        guard let frame = layerRenderer.queryNextFrame() else { return }

        frame.startUpdate()
        frame.endUpdate()

        guard let timing = frame.predictTiming() else { return }
        LayerRenderer.Clock().wait(until: timing.optimalInputTime)

        let drawables = frame.queryDrawables()
        guard !drawables.isEmpty else { return }

        guard let splatRenderer, splatRenderer.isReadyToRender else {
            frame.startSubmission()
            for drawable in drawables {
                guard let commandBuffer = commandQueue.makeCommandBuffer() else {
                    fatalError("Failed to create command buffer")
                }
                drawable.encodePresent(commandBuffer: commandBuffer)
                commandBuffer.commit()
            }
            frame.endSubmission()
            return
        }

        _ = inFlightSemaphore.wait(timeout: .distantFuture)

        frame.startSubmission()

        let primaryDrawable = drawables[0]
        let time = LayerRenderer.Clock.Instant.epoch
            .duration(to: primaryDrawable.frameTiming.presentationTime)
            .timeInterval
        let deviceAnchor = worldTracking.queryDeviceAnchor(atTimestamp: time)
        let nav = updateNavigation(deviceAnchor: deviceAnchor, time: time)

        // The splat model transform that the renderer + the waypoint markers
        // both consume. Computed once per frame from the post-update
        // viewerOffset so a mid-dolly frame still places the markers
        // correctly.
        let splatModel = splatModelMatrix(viewerOffset: nav.viewerOffset)
        if let headWorld = deviceAnchor?.originFromAnchorTransform {
            stateLock.withLock {
                $0.lastHeadWorld = headWorld
                $0.lastSplatModel = splatModel
                $0.hasFrameSample = true
            }
        }
        let editSnapshot: (
            activeTool: ToolMode,
            pendingWaypoints: [PendingWaypoint],
            pendingDeletionSpheres: [DeletionSphere],
            pendingDeletionBoxes: [DeletionBox],
            pendingDeletionLassos: [DeletionLasso],
            liveBoxLocal: (lo: SIMD3<Float>, hi: SIMD3<Float>)?,
            liveLasso: LassoLiveState?,
            brushRadius: Float,
            brushPreview: SIMD3<Float>?,
            hideWaypoints: Bool,
            hidePendingDeletions: Bool,
            hideSilhouette: Bool,
            hideReticle: Bool,
            pendingHotspots: [PendingHotspot],
            selectedPendingHotspotId: UUID?,
            pendingComments: [PendingComment],
            selectedPendingCommentId: UUID?,
            selectedCommittedCommentId: UUID?
        ) = editLock.withLock {
            (
                $0.activeTool,
                $0.pendingWaypoints,
                $0.pendingDeletionSpheres,
                $0.pendingDeletionBoxes,
                $0.pendingDeletionLassos,
                $0.liveBoxLocal,
                $0.lassoLive,
                $0.brushRadius,
                $0.brushPreviewWorldPos,
                $0.hideWaypoints,
                $0.hidePendingDeletions,
                $0.hideSilhouette,
                $0.hideReticle,
                $0.pendingHotspots,
                $0.selectedPendingHotspotId,
                $0.pendingComments,
                $0.selectedPendingCommentId,
                $0.selectedCommittedCommentId
            )
        }
        let markers = buildMarkers(
            splatModelMatrix: splatModel,
            reticleWorldPosition: nav.reticleWorldPosition,
            aimedWaypointId: nav.aimedWaypointId,
            aimedPendingId: nav.aimedPendingId,
            pendingWaypoints: editSnapshot.pendingWaypoints,
            pendingDeletionSpheres: editSnapshot.pendingDeletionSpheres,
            pendingDeletionBoxes: editSnapshot.pendingDeletionBoxes,
            pendingDeletionLassos: editSnapshot.pendingDeletionLassos,
            liveBoxLocal: editSnapshot.liveBoxLocal,
            liveLasso: editSnapshot.liveLasso,
            brushRadius: editSnapshot.brushRadius,
            brushPreviewWorldPos: editSnapshot.brushPreview,
            activeTool: editSnapshot.activeTool,
            pendingHotspots: editSnapshot.pendingHotspots,
            selectedPendingHotspotId: editSnapshot.selectedPendingHotspotId,
            pendingComments: editSnapshot.pendingComments,
            selectedPendingCommentId: editSnapshot.selectedPendingCommentId,
            selectedCommittedCommentId: editSnapshot.selectedCommittedCommentId,
            yawPreviewOrigin: nav.yawPreviewOrigin,
            yawPreviewYaw: nav.yawPreviewYaw,
            hideWaypoints: editSnapshot.hideWaypoints,
            hidePendingDeletions: editSnapshot.hidePendingDeletions,
            hideSilhouette: editSnapshot.hideSilhouette,
            hideReticle: editSnapshot.hideReticle
        )

        // M6.6 — sample per-frame perf counters BEFORE the encode loop so
        // the SwiftUI HUD reflects the last fully-built frame.
        let drawableCount = drawables.count
        let markerCount = markers.count
        perfLock.withLock { p in
            p.frameCount += 1
            p.fpsWindowFrames += 1
            p.lastMarkerCount = markerCount
            p.lastDrawableCount = drawableCount
            let now = CACurrentMediaTime()
            if p.fpsWindowStart <= 0 { p.fpsWindowStart = now }
            let elapsed = now - p.fpsWindowStart
            // Sample once per ~0.5 s for a smooth-but-responsive readout.
            if elapsed >= 0.5 {
                p.lastFps = Double(p.fpsWindowFrames) / elapsed
                p.fpsWindowStart = now
                p.fpsWindowFrames = 0
            }
        }

        for (index, drawable) in drawables.enumerated() {
            guard let commandBuffer = commandQueue.makeCommandBuffer() else {
                fatalError("Failed to create command buffer")
            }

            drawable.deviceAnchor = deviceAnchor

            if index == drawables.count - 1 {
                let semaphore = inFlightSemaphore
                commandBuffer.addCompletedHandler { _ in
                    semaphore.signal()
                }
            }

            let frameData = buildFrameData(
                drawable: drawable,
                deviceAnchor: deviceAnchor,
                splatModelMatrix: splatModel
            )

            let splatViewports = frameData.map {
                SplatRenderer.ViewportDescriptor(
                    viewport: $0.viewport,
                    projectionMatrix: $0.projectionMatrix,
                    viewMatrix: $0.splatViewMatrix,
                    screenSize: $0.screenSize
                )
            }

            do {
                try splatRenderer.render(
                    viewports: splatViewports,
                    colorTexture: drawable.colorTextures[0],
                    colorStoreAction: .store,
                    depthTexture: drawable.depthTextures[0],
                    rasterizationRateMap: drawable.rasterizationRateMaps.first,
                    renderTargetArrayLength: layerRenderer.configuration.layout == .layered ? drawable.views.count : 1,
                    to: commandBuffer
                )
            } catch {
                Self.log.error("Render error: \(error.localizedDescription)")
            }

            if let reticleRenderer {
                reticleRenderer.render(
                    markers: markers,
                    userViewpointMatrices: frameData.map(\.userViewpointMatrix),
                    projectionMatrices: frameData.map(\.projectionMatrix),
                    viewports: frameData.map(\.viewport),
                    colorTexture: drawable.colorTextures[0],
                    depthTexture: drawable.depthTextures[0],
                    rasterizationRateMap: drawable.rasterizationRateMaps.first,
                    renderTargetArrayLength: layerRenderer.configuration.layout == .layered ? drawable.views.count : 1,
                    to: commandBuffer
                )
            }

            drawable.encodePresent(commandBuffer: commandBuffer)
            commandBuffer.commit()
        }

        frame.endSubmission()
    }

    private func renderLoop() {
        while true {
            autoreleasepool {
                switch layerRenderer.state {
                case .invalidated:
                    Self.log.warning("Layer invalidated")
                    return
                case .paused:
                    layerRenderer.waitUntilRunning()
                    return
                default:
                    renderFrame()
                }
            }
            if layerRenderer.state == .invalidated { return }
        }
    }
}

final class RendererTaskExecutor: TaskExecutor {
    static let shared = RendererTaskExecutor()
    private let queue = DispatchQueue(label: "SplatRenderThread", qos: .userInteractive)

    func enqueue(_ job: UnownedJob) {
        queue.async {
            job.runSynchronously(on: self.asUnownedSerialExecutor())
        }
    }

    nonisolated func asUnownedSerialExecutor() -> UnownedTaskExecutor {
        UnownedTaskExecutor(ordinary: self)
    }
}

func matrix4x4_rotation(radians: Float, axis: SIMD3<Float>) -> matrix_float4x4 {
    let unitAxis = normalize(axis)
    let ct = cosf(radians)
    let st = sinf(radians)
    let ci = 1 - ct
    let x = unitAxis.x, y = unitAxis.y, z = unitAxis.z
    return matrix_float4x4(columns: (
        vector_float4(    ct + x * x * ci, y * x * ci + z * st, z * x * ci - y * st, 0),
        vector_float4(x * y * ci - z * st,     ct + y * y * ci, z * y * ci + x * st, 0),
        vector_float4(x * z * ci + y * st, y * z * ci - x * st,     ct + z * z * ci, 0),
        vector_float4(                  0,                   0,                   0, 1)
    ))
}

func matrix4x4_translation(_ tx: Float, _ ty: Float, _ tz: Float) -> matrix_float4x4 {
    matrix_float4x4(columns: (
        vector_float4(1, 0, 0, 0),
        vector_float4(0, 1, 0, 0),
        vector_float4(0, 0, 1, 0),
        vector_float4(tx, ty, tz, 1)
    ))
}

func matrix4x4_scale(_ s: Float) -> matrix_float4x4 {
    matrix_float4x4(columns: (
        vector_float4(s, 0, 0, 0),
        vector_float4(0, s, 0, 0),
        vector_float4(0, 0, s, 0),
        vector_float4(0, 0, 0, 1)
    ))
}

#endif
