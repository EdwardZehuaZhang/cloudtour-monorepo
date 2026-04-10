import SwiftUI

struct AppShell: View {
    @State var authViewModel: AuthViewModel
    @State private var selectedTab: SidebarTab? = .explore
    @State private var directoryVM = TourDirectoryViewModel()
    @State private var dashboardVM = DashboardViewModel()
    @State private var membersVM = MembersViewModel()

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
                if authViewModel.isAuthenticated {
                    NavigationSplitView {
                        Sidebar(selection: $selectedTab)
                    } detail: {
                        switch selectedTab {
                        case .explore: TourDirectoryView(viewModel: directoryVM)
                        case .myTours: DashboardView(viewModel: dashboardVM)
                        case .members: MembersView(viewModel: membersVM)
                        case .settings: SettingsView(authViewModel: authViewModel)
                        case nil: Text("Select a tab").foregroundStyle(.secondary)
                        }
                    }
                } else {
                    SignInView(authViewModel: authViewModel)
                }
            }
        }
        .task {
            await authViewModel.checkSession()
        }
    }
}
