import SwiftUI

struct AppShell: View {
    @State var authViewModel: AuthViewModel
    @State private var selectedTab: SidebarTab? = .explore
    @State private var directoryVM = TourDirectoryViewModel()
    @State private var dashboardVM = DashboardViewModel()
    @State private var membersVM = MembersViewModel()

    var body: some View {
        Group {
            if authViewModel.isAuthenticated {
                NavigationSplitView {
                    Sidebar(selection: $selectedTab)
                } detail: {
                    switch selectedTab {
                    case .explore:
                        TourDirectoryView(viewModel: directoryVM)
                    case .myTours:
                        DashboardView(viewModel: dashboardVM)
                    case .members:
                        MembersView(viewModel: membersVM)
                    case .settings:
                        SettingsView(authViewModel: authViewModel)
                    case nil:
                        Text("Select a tab")
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                SignInView(authViewModel: authViewModel)
            }
        }
        .task {
            await authViewModel.checkSession()
        }
    }
}
