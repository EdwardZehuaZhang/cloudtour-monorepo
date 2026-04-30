import Foundation
import simd

struct Quaternion: Codable, Hashable, Sendable {
    var x: Double
    var y: Double
    var z: Double
    var w: Double

    static let identity = Quaternion(x: 0, y: 0, z: 0, w: 1)

    var simd: simd_quatf {
        simd_quatf(ix: Float(x), iy: Float(y), iz: Float(z), r: Float(w))
    }
}

struct SceneTransform: Codable, Hashable, Sendable {
    var scale: Double
    var rotation: Quaternion
    var translation: Position3D

    static let identity = SceneTransform(
        scale: 1.0,
        rotation: .identity,
        translation: Position3D(x: 0, y: 0, z: 0)
    )
}

struct DeletionSphere: Codable, Hashable, Sendable {
    var center: [Double]   // [x, y, z]
    var radius: Double
}

struct DeletionBox: Codable, Hashable, Sendable {
    var min: [Double]      // [x, y, z]
    var max: [Double]
}

struct DeletionLasso: Codable, Hashable, Sendable {
    var plane: [Double]    // [a, b, c, d]
    var polygon: [[Double]] // [[u, v], ...]
}

/// M7.3 — positive-mask deletion. Subtracts from any negative deletion
/// volume that overlaps it, so the user can recover from over-aggressive
/// erase. Long-pinch (≥0.5s) inside a pending DeletionSphere/Box/Lasso
/// drops one of these.
struct DeletionRestore: Codable, Hashable, Sendable {
    var center: [Double]   // [x, y, z]
    var radius: Double
}

struct SceneDeletions: Codable, Hashable, Sendable {
    var indices: String?
    var spheres: [DeletionSphere]?
    var boxes: [DeletionBox]?
    var lassos: [DeletionLasso]?
    var restores: [DeletionRestore]?

    static let empty = SceneDeletions(indices: nil, spheres: nil, boxes: nil, lassos: nil, restores: nil)
}

/// Non-destructive edit-list for a Gaussian splat scene. Mirrors the
/// `scene_edits` JSONB column in Postgres. NULL on the scene record means
/// identity transform + no deletions.
struct SceneEdits: Codable, Hashable, Sendable {
    var version: Int
    var transform: SceneTransform
    var deletions: SceneDeletions

    static let initial = SceneEdits(
        version: 1,
        transform: .identity,
        deletions: .empty
    )
}
