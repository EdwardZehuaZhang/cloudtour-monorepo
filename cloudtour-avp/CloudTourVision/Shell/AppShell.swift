import SwiftUI
import Inject

struct AppShell: View {
    @ObserveInjection var inject
    @Environment(\.openURL) private var openURL
    @State var authViewModel: AuthViewModel
    @State private var selectedTab: SidebarTab? = .explore
    @State private var directoryVM = TourDirectoryViewModel()
    @State private var dashboardVM = DashboardViewModel()
    @State private var membersVM = MembersViewModel()
    @State private var showSignInSheet = false
    // M7.15 — plan badge data. Loaded from org_members → organizations on
    // auth restore; nil while loading or unauthenticated.
    @State private var currentPlan: String? = nil

    private var demoScreen: String {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "--demo"), args.count > idx + 1 {
            return args[idx + 1]
        }
        return "default"
    }

    var body: some View {
        Group {
            switch demoScreen {
            case "signup":
                SignUpView(authViewModel: authViewModel)
            case "forgot":
                ForgotPasswordView(authViewModel: authViewModel)
            case "explore":
                NavigationSplitView {
                    Sidebar(selection: .constant(.explore))
                } detail: {
                    TourDirectoryView(viewModel: directoryVM)
                }
            case "dashboard":
                NavigationSplitView {
                    Sidebar(selection: .constant(.myTours))
                } detail: {
                    DashboardView(viewModel: dashboardVM)
                }
            case "members":
                NavigationSplitView {
                    Sidebar(selection: .constant(.members))
                } detail: {
                    MembersView(viewModel: membersVM)
                }
            case "settings":
                NavigationSplitView {
                    Sidebar(selection: .constant(.settings))
                } detail: {
                    SettingsView(authViewModel: authViewModel)
                }
            default:
                NavigationSplitView {
                    Sidebar(
                        selection: $selectedTab,
                        isAuthenticated: authViewModel.isAuthenticated,
                        onSignInTapped: { showSignInSheet = true },
                        plan: currentPlan,
                        onUpgradeTapped: openPlanLink
                    )
                } detail: {
                    switch selectedTab {
                    case .explore: TourDirectoryView(viewModel: directoryVM)
                    case .myTours: DashboardView(viewModel: dashboardVM)
                    case .members: MembersView(viewModel: membersVM)
                    case .streetView: StreetViewTabView()
                    case .faq: FAQView()
                    case .settings: SettingsView(authViewModel: authViewModel)
                    case nil: Text("Select a tab").foregroundStyle(.secondary)
                    }
                }
                .sheet(isPresented: $showSignInSheet) {
                    SignInView(authViewModel: authViewModel)
                }
                .onChange(of: authViewModel.isAuthenticated) { _, isAuth in
                    if isAuth {
                        showSignInSheet = false
                    } else if let tab = selectedTab,
                              tab != .explore && tab != .streetView && tab != .faq && tab != .settings {
                        selectedTab = .explore
                    }
                }
            }
        }
        .task {
            await authViewModel.checkSession()
        }
        .task(id: authViewModel.isAuthenticated) {
            if authViewModel.isAuthenticated {
                await loadPlan()
            } else {
                currentPlan = nil
            }
        }
        .enableInjection()
    }

    // M7.15 — open plan management in the system browser. Free plans go
    // to /pricing; paid plans go to /dashboard/billing. Web base derived
    // by stripping the leading "api." subdomain from API_BASE_URL so a
    // single config knob covers both.
    private func openPlanLink() {
        let isFree = (currentPlan ?? "free").lowercased() == "free"
        let path = isFree ? "/pricing" : "/dashboard/billing"
        guard let url = AppShell.webURL(path: path) else { return }
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

    private func loadPlan() async {
        guard let userId = authViewModel.currentUserId else {
            currentPlan = nil
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
            guard let member = members.first else { return }
            let orgs: [Organization] = try await AppSupabase.client
                .from("organizations")
                .select()
                .eq("id", value: member.orgId.uuidString)
                .limit(1)
                .execute()
                .value
            currentPlan = orgs.first?.plan ?? "free"
        } catch {
            currentPlan = "free"
        }
    }
}
