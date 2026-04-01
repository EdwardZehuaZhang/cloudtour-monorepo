import Foundation

struct Tour: Codable, Identifiable, Hashable {
    let id: UUID
    let orgId: UUID
    var title: String
    var description: String?
    var status: String
    var coverImageUrl: String?
    var slug: String
    var location: String?
    var category: String?
    var viewCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case title
        case description
        case status
        case coverImageUrl = "cover_image_url"
        case slug
        case location
        case category
        case viewCount = "view_count"
    }
}
