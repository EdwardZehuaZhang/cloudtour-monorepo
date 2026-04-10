import Foundation

struct Organization: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var plan: String?
    var stripeCustomerId: String?
    var stripeSubscriptionId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case plan
        case stripeCustomerId = "stripe_customer_id"
        case stripeSubscriptionId = "stripe_subscription_id"
    }
}
