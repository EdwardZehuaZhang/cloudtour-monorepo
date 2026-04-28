import SwiftUI

struct SettingsView: View {
    @Bindable var authViewModel: AuthViewModel
    @Environment(\.openURL) private var openURL
    @State private var organization: Organization?
    @State private var isLoading = true
    @State private var showSignIn = false

    var body: some View {
        NavigationStack {
            Form {
                if !authViewModel.isAuthenticated {
                    Section("Account") {
                        Button {
                            showSignIn = true
                        } label: {
                            Label("Sign In", systemImage: "rectangle.portrait.and.arrow.right.fill")
                        }
                    }
                } else {
                    if let org = organization {
                        Section("Organization") {
                            LabeledContent("Name", value: org.name)

                            LabeledContent("Plan") {
                                Text(org.plan?.capitalized ?? "Free")
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(.fill.tertiary, in: Capsule())
                            }
                        }

                        Section("Billing") {
                            Button {
                                openManageSubscription()
                            } label: {
                                Label("Manage Subscription", systemImage: "creditcard")
                            }
                            .accessibilityHint("Open billing page in browser")
                            if (org.plan ?? "free").lowercased() == "free" {
                                Button {
                                    openPricing()
                                } label: {
                                    Label("Upgrade Plan", systemImage: "sparkles")
                                }
                                .accessibilityHint("Open pricing page in browser")
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
                }

                Section("About") {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                    LabeledContent("Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                }
            }
            .navigationTitle("Settings")
            .task(id: authViewModel.isAuthenticated) {
                if authViewModel.isAuthenticated {
                    await loadOrganization()
                } else {
                    organization = nil
                    isLoading = false
                }
            }
            .sheet(isPresented: $showSignIn) {
                SignInView(authViewModel: authViewModel)
                    .onChange(of: authViewModel.isAuthenticated) { _, isAuth in
                        if isAuth { showSignIn = false }
                    }
            }
        }
    }

    private func loadOrganization() async {
        isLoading = true
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

    private func openManageSubscription() {
        guard let url = SettingsView.webURL(path: "/dashboard/billing") else { return }
        openURL(url)
    }

    private func openPricing() {
        guard let url = SettingsView.webURL(path: "/pricing") else { return }
        openURL(url)
    }

    private static func webURL(path: String) -> URL? {
        let apiBase = (Bundle.main.infoDictionary?["API_BASE_URL"] as? String) ?? ""
        let trimmed = apiBase.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, var components = URLComponents(string: trimmed) else {
            return URL(string: "https://cloudtour.io" + path)
        }
        if let host = components.host, host.hasPrefix("api.") {
            components.host = String(host.dropFirst("api.".count))
        }
        components.path = path
        components.query = nil
        return components.url
    }
}
