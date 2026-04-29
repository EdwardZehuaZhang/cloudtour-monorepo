import Foundation

/// Lightweight, Sendable view of a Waypoint, suitable for crossing the
/// CompositorLayer boundary into `SplatImmersiveRenderer`. Carries both
/// the marker's position in splat-local coordinates and the optional
/// arrival pose used by same-scene teleport.
struct WaypointMarker: Codable, Hashable, Sendable {
    let id: UUID
    let sceneId: UUID
    let targetSceneId: UUID
    let x: Float
    let y: Float
    let z: Float
    let label: String
    let targetX: Float?
    let targetY: Float?
    let targetZ: Float?
    let targetYaw: Float?

    var position: SIMD3<Float> { SIMD3(x, y, z) }

    var targetPosition: SIMD3<Float>? {
        guard let tx = targetX, let ty = targetY, let tz = targetZ else { return nil }
        return SIMD3(tx, ty, tz)
    }

    init(from waypoint: Waypoint) {
        self.id = waypoint.id
        self.sceneId = waypoint.sceneId
        self.targetSceneId = waypoint.targetSceneId
        self.x = Float(waypoint.position3D.x)
        self.y = Float(waypoint.position3D.y)
        self.z = Float(waypoint.position3D.z)
        self.label = waypoint.label
        if let p = waypoint.targetPosition3D {
            self.targetX = Float(p.x)
            self.targetY = Float(p.y)
            self.targetZ = Float(p.z)
        } else {
            self.targetX = nil
            self.targetY = nil
            self.targetZ = nil
        }
        self.targetYaw = waypoint.targetYaw
    }
}

/// Lightweight, Sendable view of a Hotspot for the immersive renderer.
/// M6.1 — committed hotspots render as filled amber circles in-scene.
struct HotspotMarker: Codable, Hashable, Sendable {
    let id: UUID
    let sceneId: UUID
    let x: Float
    let y: Float
    let z: Float
    let title: String
    let contentType: HotspotContentType

    var position: SIMD3<Float> { SIMD3(x, y, z) }

    init(from hotspot: Hotspot) {
        self.id = hotspot.id
        self.sceneId = hotspot.sceneId
        self.x = Float(hotspot.position3D.x)
        self.y = Float(hotspot.position3D.y)
        self.z = Float(hotspot.position3D.z)
        self.title = hotspot.title
        self.contentType = hotspot.contentType
    }
}

/// Lightweight view of a Comment for the immersive renderer. Read-only —
/// committed comments render as purple-violet spheres; replies aren't
/// drawn in 3D, only in the SwiftUI thread popover.
struct CommentMarker: Codable, Hashable, Sendable {
    let id: UUID
    let sceneId: UUID
    let x: Float
    let y: Float
    let z: Float
    let resolved: Bool

    var position: SIMD3<Float> { SIMD3(x, y, z) }

    init(from comment: Comment) {
        self.id = comment.id
        self.sceneId = comment.sceneId
        self.x = Float(comment.position3D.x)
        self.y = Float(comment.position3D.y)
        self.z = Float(comment.position3D.z)
        self.resolved = comment.resolved
    }
}

/// All session state passed from the 2D pre-immersive view into the
/// CompositorLayer. Replaces the older `SplatFileIdentifier`. The session
/// itself stays intentionally small (URL + identifiers + edits + waypoints)
/// — auth tokens and Supabase clients are resolved in-process from
/// `AppSupabase.client` once we're inside the renderer.
struct SplatSession: Hashable, Codable {
    let url: URL
    let sceneId: UUID
    let tourId: UUID
    let orgId: UUID
    /// `true` when launched from the "Edit" entry point; gates the editor
    /// tool panel + mandatory calibration wizard added in later milestones.
    let editMode: Bool
    let sceneEdits: SceneEdits?
    let waypoints: [WaypointMarker]
    let hotspots: [HotspotMarker]
    let comments: [CommentMarker]

    init(
        url: URL,
        sceneId: UUID,
        tourId: UUID,
        orgId: UUID,
        editMode: Bool = false,
        sceneEdits: SceneEdits? = nil,
        waypoints: [WaypointMarker] = [],
        hotspots: [HotspotMarker] = [],
        comments: [CommentMarker] = []
    ) {
        self.url = url
        self.sceneId = sceneId
        self.tourId = tourId
        self.orgId = orgId
        self.editMode = editMode
        self.sceneEdits = sceneEdits
        self.waypoints = waypoints
        self.hotspots = hotspots
        self.comments = comments
    }
}
