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
    // M7.15 — plan badge + upgrade CTA. Sidebar stays plan-agnostic when
    // `plan` is nil; renders a compact tappable capsule when supplied.
    var plan: String? = nil
    var onUpgradeTapped: (() -> Void)? = nil

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
            } else if let plan {
                Divider()
                planBadge(plan: plan)
            }
        }
        .navigationTitle("CloudTour")
    }

    @ViewBuilder
    private func planBadge(plan: String) -> some View {
        let isFree = plan.lowercased() == "free"
        Button {
            onUpgradeTapped?()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isFree ? "sparkles" : "checkmark.seal.fill")
                    .foregroundStyle(isFree ? Color.accentColor : Color.green)
                Text(plan.capitalized)
                    .font(.callout)
                    .fontWeight(.medium)
                Spacer(minLength: 0)
                if isFree {
                    Text("Upgrade")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Image(systemName: "arrow.up.right.square")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.fill.tertiary, in: Capsule())
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(.hoverEffect, Capsule())
        }
        .buttonStyle(.plain)
        .hoverEffect(.lift)
        .accessibilityLabel("Plan: \(plan.capitalized)")
        .accessibilityHint(isFree ? "Open pricing page in browser to upgrade" : "Open billing page in browser to manage subscription")
    }
}
