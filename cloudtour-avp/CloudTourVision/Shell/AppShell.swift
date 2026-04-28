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
    // M7.16 — org switcher state. Available orgs come from the user's
    // membership rows; activeOrgId is persisted across sessions.
    @State private var availableOrgs: [Organization] = []
    @AppStorage("activeOrgId") private var activeOrgIdRaw: String = ""

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
                        onUpgradeTapped: openPlanLink,
                        orgs: availableOrgs,
                        activeOrgId: activeOrgUUID,
                        onOrgChanged: switchActiveOrg
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

    private var activeOrgUUID: UUID? {
        UUID(uuidString: activeOrgIdRaw) ?? availableOrgs.first?.id
    }

    private func switchActiveOrg(_ id: UUID) {
        activeOrgIdRaw = id.uuidString
        currentPlan = availableOrgs.first { $0.id == id }?.plan ?? "free"
        dashboardVM.setActiveOrg(id)
        membersVM.setActiveOrg(id)
        Task {
            await dashboardVM.loadTours()
            await membersVM.loadMembers()
        }
    }

    private func loadPlan() async {
        guard let userId = authViewModel.currentUserId else {
            currentPlan = nil
            availableOrgs = []
            return
        }
        do {
            let members: [OrgMember] = try await AppSupabase.client
                .from("org_members")
                .select()
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value
            guard !members.isEmpty else {
                currentPlan = "free"
                availableOrgs = []
                return
            }
            let orgIds = members.map { $0.orgId.uuidString }
            let orgs: [Organization] = try await AppSupabase.client
                .from("organizations")
                .select()
                .in("id", values: orgIds)
                .execute()
                .value
            availableOrgs = orgs
            // Resolve the active org: AppStorage takes priority, fall back
            // to the first membership. Persist whichever we landed on so
            // sidebar + viewmodels share a single source of truth.
            let resolvedId: UUID = {
                if let stored = UUID(uuidString: activeOrgIdRaw),
                   orgs.contains(where: { $0.id == stored }) {
                    return stored
                }
                return orgs.first?.id ?? members[0].orgId
            }()
            activeOrgIdRaw = resolvedId.uuidString
            currentPlan = orgs.first { $0.id == resolvedId }?.plan ?? "free"
            dashboardVM.setActiveOrg(resolvedId)
            membersVM.setActiveOrg(resolvedId)
        } catch {
            currentPlan = "free"
        }
    }
}
