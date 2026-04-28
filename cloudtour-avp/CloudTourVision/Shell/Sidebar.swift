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
    // M7.16 — org switcher. Picker only renders when `orgs.count > 1`.
    // Single-org users see a static org name above the plan badge.
    var orgs: [Organization] = []
    var activeOrgId: UUID? = nil
    var onOrgChanged: ((UUID) -> Void)? = nil

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
            } else {
                if orgs.count > 1 {
                    Divider()
                    orgPicker
                } else if let only = orgs.first {
                    Divider()
                    HStack(spacing: 8) {
                        Image(systemName: "building.2")
                            .foregroundStyle(.secondary)
                        Text(only.name)
                            .font(.callout)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Organization \(only.name)")
                }
                if let plan {
                    Divider()
                    planBadge(plan: plan)
                }
            }
        }
        .navigationTitle("CloudTour")
    }

    @ViewBuilder
    private var orgPicker: some View {
        Picker(selection: Binding(
            get: { activeOrgId ?? orgs.first?.id },
            set: { newId in
                guard let newId, newId != activeOrgId else { return }
                onOrgChanged?(newId)
            }
        )) {
            ForEach(orgs) { org in
                Text(org.name).tag(Optional(org.id))
            }
        } label: {
            Label("Organization", systemImage: "building.2")
        }
        .pickerStyle(.menu)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityLabel("Switch organization")
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
