import SwiftUI

enum SidebarTab: String, CaseIterable, Identifiable {
    case explore = "Explore"
    case myTours = "My Tours"
    case members = "Members"
    case streetView = "Street View"
    case faq = "FAQ"
    case settings = "Settings"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .explore: "globe"
        case .myTours: "map"
        case .members: "person.2"
        case .streetView: "binoculars"
        case .faq: "questionmark.circle"
        case .settings: "gearshape"
        }
    }
}

struct Sidebar: View {
    @Binding var selection: SidebarTab?
    var isAuthenticated: Bool = true
    var onSignInTapped: (() -> Void)? = nil

    private var visibleTabs: [SidebarTab] {
        isAuthenticated
            ? SidebarTab.allCases
            : [.explore, .streetView, .faq, .settings]
    }

    var body: some View {
        VStack(spacing: 0) {
            List(visibleTabs, selection: $selection) { tab in
                Label(tab.rawValue, systemImage: tab.icon)
                    .tag(tab)
            }

            if !isAuthenticated {
                Divider()
                Button {
                    onSignInTapped?()
                } label: {
                    Label("Sign In", systemImage: "rectangle.portrait.and.arrow.right.fill")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                        .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
            }
        }
        .navigationTitle("CloudTour")
    }
}
