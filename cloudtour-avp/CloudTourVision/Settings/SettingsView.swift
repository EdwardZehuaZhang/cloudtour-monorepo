import SwiftUI

struct SettingsView: View {
    @Bindable var authViewModel: AuthViewModel
    @State private var organization: Organization?
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Form {
                if let org = organization {
                    Section("Organization") {
                        LabeledContent("Name", value: org.name)

                        LabeledContent("Plan") {
                            Text(org.plan?.capitalized ?? "Free")
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.tint.opacity(0.1), in: Capsule())
                        }
                    }

                    if org.stripeCustomerId != nil {
                        Section("Billing") {
                            Button {
                                openBillingPortal(org: org)
                            } label: {
                                Label("Manage Billing", systemImage: "creditcard")
                            }
                        }
                    }
                } else if isLoading {
                    Section {
                        ProgressView()
                    }
                }

                Section("Account") {
                    Button(role: .destructive) {
                        Task { await authViewModel.signOut() }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                    LabeledContent("Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                }
            }
            .navigationTitle("Settings")
            .task {
                await loadOrganization()
            }
        }
    }

    private func loadOrganization() async {
        guard let userId = authViewModel.currentUserId else {
            isLoading = false
            return
        }

        do {
            let members: [OrgMember] = try await AppSupabase.client
                .from("org_members")
                .select()
                .eq("user_id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value

            if let member = members.first {
                let orgs: [Organization] = try await AppSupabase.client
                    .from("organizations")
                    .select()
                    .eq("id", value: member.orgId.uuidString)
                    .limit(1)
                    .execute()
                    .value
                organization = orgs.first
            }
        } catch {
            // Silently fail — settings still usable without org info
        }
        isLoading = false
    }

    private func openBillingPortal(org: Organization) {
        guard let apiBase = Bundle.main.infoDictionary?["API_BASE_URL"] as? String,
              let url = URL(string: "\(apiBase)/api/billing/portal?customer_id=\(org.stripeCustomerId ?? "")") else {
            return
        }
        #if os(visionOS)
        // visionOS can open URLs via UIApplication.shared
        #endif
    }
}
