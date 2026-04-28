import Foundation

/// `hotspots.content_type` column values. Mirrors the BE Zod enum.
enum HotspotContentType: String, Codable, Hashable, Sendable, CaseIterable {
    case text
    case image
    case video
    case audio
    case link

    /// Three-step cycle used by the in-immersive aim+pinch toggle. Five
    /// types is too many to flick through in the air; the M6 spec calls
    /// out link / image / text as the in-headset rotation. Audio + video
    /// stay reachable from the SwiftUI inspector.
    static let cycleOrder: [HotspotContentType] = [.text, .image, .link]

    func nextInCycle() -> HotspotContentType {
        let order = HotspotContentType.cycleOrder
        let idx = order.firstIndex(of: self) ?? 0
        return order[(idx + 1) % order.count]
    }
}

struct Hotspot: Codable, Identifiable, Hashable {
    let id: UUID
    let sceneId: UUID
    var title: String
    var contentType: HotspotContentType
    var contentMarkdown: String?
    var mediaUrl: String?
    var icon: String?
    var position3D: Position3D

    enum CodingKeys: String, CodingKey {
        case id
        case sceneId = "scene_id"
        case title
        case contentType = "content_type"
        case contentMarkdown = "content_markdown"
        case mediaUrl = "media_url"
        case icon
        case position3D = "position_3d"
    }
}
