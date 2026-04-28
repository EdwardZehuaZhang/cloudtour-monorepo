import Foundation
import simd

/// In-scene editor tool selection. Drives `SplatImmersiveRenderer`'s
/// per-frame gesture dispatch. New tools (brush, box, lasso, waypoint,
/// gizmo) are added in later milestones.
enum ToolMode: String, Codable, Hashable, Sendable, CaseIterable {
    case view
    case calibrate
    case waypoint
    case brush
    case box
    case lasso
    case hotspot
}

extension SceneTransform {
    /// Returns a new transform with `translationDelta` (world-space meters)
    /// added, `scaleMultiplier` applied to the uniform scale, and `yawDelta`
    /// (radians, around +Y) post-multiplied onto the rotation. Used by the
    /// calibrate tool to apply per-frame gesture deltas to a baseline
    /// transform captured at gesture start.
    func applying(
        translationDelta: SIMD3<Float> = .zero,
        scaleMultiplier: Float = 1.0,
        yawDelta: Float = 0.0
    ) -> SceneTransform {
        let yawQuat = simd_quatf(angle: yawDelta, axis: SIMD3<Float>(0, 1, 0))
        let combined = yawQuat * rotation.simd
        return SceneTransform(
            scale: max(0.001, scale * Double(scaleMultiplier)),
            rotation: Quaternion(
                x: Double(combined.imag.x),
                y: Double(combined.imag.y),
                z: Double(combined.imag.z),
                w: Double(combined.real)
            ),
            translation: Position3D(
                x: translation.x + Double(translationDelta.x),
                y: translation.y + Double(translationDelta.y),
                z: translation.z + Double(translationDelta.z)
            )
        )
    }
}
