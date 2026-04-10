import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class MembersViewModel {
    var members: [OrgMember] = []
    var isLoading = false
    var errorMessage: String?

    private var orgId: UUID?

    func loadMembers() async {
        isLoading = true
        do {
            let session = try await AppSupabase.client.auth.session
            let myMemberships: [OrgMember] = try await AppSupabase.client
                .from("org_members")
                .select()
                .eq("user_id", value: session.user.id.uuidString)
                .limit(1)
                .execute()
                .value

            guard let membership = myMemberships.first else {
                isLoading = false
                return
            }
            orgId = membership.orgId

            members = try await AppSupabase.client
                .from("org_members")
                .select()
                .eq("org_id", value: membership.orgId.uuidString)
                .execute()
                .value
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func inviteMember(email: String, role: String) async {
        guard let orgId else { return }
        do {
            struct Invite: Encodable {
                let org_id: String
                let invited_email: String
                let role: String
            }

            try await AppSupabase.client
                .from("org_members")
                .insert(Invite(org_id: orgId.uuidString, invited_email: email, role: role))
                .execute()

            await loadMembers()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeMember(_ member: OrgMember) async {
        do {
            try await AppSupabase.client
                .from("org_members")
                .delete()
                .eq("id", value: member.id.uuidString)
                .execute()

            members.removeAll { $0.id == member.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
