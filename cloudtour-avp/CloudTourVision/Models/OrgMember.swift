import Foundation

struct OrgMember: Codable, Identifiable, Hashable {
    let id: UUID
    let orgId: UUID
    let userId: UUID?
    var invitedEmail: String?
    var role: String
    var joinedAt: String?
    var displayName: String?
    var username: String?

    enum CodingKeys: String, CodingKey {
        case id
        case orgId = "org_id"
        case userId = "user_id"
        case invitedEmail = "invited_email"
        case role
        case joinedAt = "joined_at"
        case displayName = "display_name"
        case username
    }
}
