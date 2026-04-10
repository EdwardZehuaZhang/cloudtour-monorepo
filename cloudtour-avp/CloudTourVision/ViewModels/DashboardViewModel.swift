import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class DashboardViewModel {
    var tours: [Tour] = []
    var isLoading = false
    var errorMessage: String?

    private var orgId: UUID?

    func loadTours() async {
        isLoading = true
        do {
            // First get user's org
            let session = try await AppSupabase.client.auth.session
            let members: [OrgMember] = try await AppSupabase.client
                .from("org_members")
                .select()
                .eq("user_id", value: session.user.id.uuidString)
                .limit(1)
                .execute()
                .value

            guard let member = members.first else {
                isLoading = false
                return
            }
            orgId = member.orgId

            tours = try await AppSupabase.client
                .from("tours")
                .select()
                .eq("org_id", value: member.orgId.uuidString)
                .order("view_count", ascending: false)
                .execute()
                .value
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func createTour(title: String) async {
        guard let orgId else { return }
        do {
            let slug = title.lowercased()
                .replacingOccurrences(of: " ", with: "-")
                .replacingOccurrences(of: "[^a-z0-9-]", with: "", options: .regularExpression)

            struct NewTour: Encodable {
                let org_id: String
                let title: String
                let slug: String
                let status: String
                let view_count: Int
            }

            let newTour = NewTour(
                org_id: orgId.uuidString,
                title: title,
                slug: slug,
                status: "draft",
                view_count: 0
            )

            try await AppSupabase.client
                .from("tours")
                .insert(newTour)
                .execute()

            await loadTours()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTour(_ tour: Tour) async {
        do {
            struct TourUpdate: Encodable {
                let title: String
                let description: String?
                let status: String
            }

            try await AppSupabase.client
                .from("tours")
                .update(TourUpdate(title: tour.title, description: tour.description, status: tour.status))
                .eq("id", value: tour.id.uuidString)
                .execute()

            await loadTours()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTour(_ tour: Tour) async {
        do {
            try await AppSupabase.client
                .from("tours")
                .delete()
                .eq("id", value: tour.id.uuidString)
                .execute()

            tours.removeAll { $0.id == tour.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
