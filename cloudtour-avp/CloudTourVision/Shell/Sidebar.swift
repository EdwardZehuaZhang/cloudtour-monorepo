import SwiftUI

enum SidebarTab: String, CaseIterable, Identifiable {
    case explore = "Explore"
    case myTours = "My Tours"
    case members = "Members"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .explore: "globe"
        case .myTours: "map"
        case .members: "person.2"
        case .settings: "gearshape"
        }
    }
}

struct Sidebar: View {
    @Binding var selection: SidebarTab?

    var body: some View {
        List(SidebarTab.allCases, selection: $selection) { tab in
            Label(tab.rawValue, systemImage: tab.icon)
                .tag(tab)
        }
        .navigationTitle("CloudTour")
    }
}
