import Foundation
import Observation

/// Shared signal channel between `SplatImmersiveRenderer` (which detects
/// pinch-on-waypoint events on its render thread) and `SplatViewerView`
/// (which observes selection from the main actor and triggers a scene
/// switch by closing the immersive space and reopening it for the new
/// scene's splat).
@MainActor
@Observable
final class WaypointSelectionState {
    static let shared = WaypointSelectionState()

    /// Set by the renderer when the user pinches while the reticle is
    /// over a waypoint. Cleared by the view after it acts on the signal.
    var pendingTargetSceneId: UUID?

    private init() {}

    func select(targetSceneId: UUID) {
        pendingTargetSceneId = targetSceneId
    }

    func clear() {
        pendingTargetSceneId = nil
    }
}
