import SwiftUI

struct DashboardView: View {
    @Bindable var viewModel: DashboardViewModel
    @State private var showCreateSheet = false
    @State private var newTourTitle = ""
    // M7.17 — first-run onboarding flag. Persisted across launches so the
    // overlay appears exactly once unless the user resets app data.
    @AppStorage("avpOnboarding.completed_v1") private var onboardingCompleted: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.tours.isEmpty {
                    ProgressView("Loading tours…")
                } else if viewModel.tours.isEmpty && !onboardingCompleted {
                    OnboardingDashboardView(
                        onCreateTour: { showCreateSheet = true },
                        onSkip: { onboardingCompleted = true }
                    )
                } else if viewModel.tours.isEmpty {
                    ContentUnavailableView {
                        Label("No Tours", systemImage: "map")
                    } description: {
                        Text("Create your first tour to get started.")
                    } actions: {
                        Button("Create Tour") { showCreateSheet = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Hero card for the first tour
                            if let hero = viewModel.tours.first {
                                NavigationLink {
                                    TourEditorView(tour: hero, viewModel: viewModel)
                                } label: {
                                    TourHeroCard(tour: hero)
                                }
                                .buttonStyle(.plain)
                            }

                            // 2-column grid for remaining tours
                            let remaining = Array(viewModel.tours.dropFirst())
                            LazyVGrid(columns: [
                                GridItem(.flexible(), spacing: 16),
                                GridItem(.flexible(), spacing: 16)
                            ], spacing: 16) {
                                ForEach(remaining) { tour in
                                    NavigationLink {
                                        TourEditorView(tour: tour, viewModel: viewModel)
                                    } label: {
                                        TourGridCard(tour: tour)
                                    }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            Task { await viewModel.deleteTour(tour) }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("My Tours")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                NavigationStack {
                    Form {
                        TextField("Tour Title", text: $newTourTitle)
                    }
                    .navigationTitle("New Tour")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showCreateSheet = false
                                newTourTitle = ""
                            }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Create") {
                                Task {
                                    await viewModel.createTour(title: newTourTitle)
                                    showCreateSheet = false
                                    newTourTitle = ""
                                }
                            }
                            .disabled(newTourTitle.isEmpty)
                        }
                    }
                }
            }
            .task {
                if viewModel.tours.isEmpty {
                    await viewModel.loadTours()
                }
            }
            .refreshable {
                await viewModel.loadTours()
            }
        }
    }
}

struct TourHeroCard: View {
    let tour: Tour

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AsyncImage(url: tour.coverImageUrl.flatMap { URL(string: $0) }) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 12)
                    .fill(.quaternary)
                    .overlay {
                        Image(systemName: "photo")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                    }
            }
            .frame(maxWidth: .infinity, minHeight: 200, maxHeight: 200)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(tour.title)
                .font(.title2)
                .fontWeight(.semibold)

            HStack {
                StatusBadge(status: tour.status)
                Spacer()
                Label("\(tour.viewCount)", systemImage: "eye")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 16))
        .hoverEffect(.lift)
    }
}

struct TourGridCard: View {
    let tour: Tour

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: tour.coverImageUrl.flatMap { URL(string: $0) }) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.quaternary)
                    .frame(height: 100)
            }
            .frame(maxWidth: .infinity, minHeight: 100, maxHeight: 100)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Text(tour.title)
                .font(.headline)
                .lineLimit(1)

            StatusBadge(status: tour.status)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 12))
        .hoverEffect(.lift)
    }
}

struct StatusBadge: View {
    let status: String

    private var symbolName: String {
        switch status {
        case "published": "checkmark.seal.fill"
        case "draft": "pencil.circle.fill"
        case "archived": "archivebox.fill"
        default: "circle.fill"
        }
    }

    private var symbolTint: Color {
        switch status {
        case "published": .green
        case "draft": .orange
        case "archived": .secondary
        default: .secondary
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbolName)
                .foregroundStyle(symbolTint)
            Text(status.capitalized)
                .foregroundStyle(.secondary)
        }
        .font(.caption2)
        .fontWeight(.medium)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(.fill.tertiary, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status: \(status.capitalized)")
    }
}

// MARK: - M7.17 first-run onboarding

private struct OnboardingDashboardView: View {
    let onCreateTour: () -> Void
    let onSkip: () -> Void

    @State private var stepIndex: Int = 0

    private struct Step {
        let symbol: String
        let title: String
        let body: String
    }

    private static let steps: [Step] = [
        Step(
            symbol: "square.and.arrow.up.on.square",
            title: "Upload your first splat",
            body: "Drop a .ply, .splat, or .spz file from Files into a new tour. Magic-byte validation runs server-side, so the format check is automatic."
        ),
        Step(
            symbol: "mappin.and.ellipse",
            title: "Place a waypoint",
            body: "Open the immersive editor, aim at a spot in the splat, and pinch to drop a waypoint. Pinch a second time to set the arrival yaw."
        ),
        Step(
            symbol: "paperplane.fill",
            title: "Publish & share",
            body: "Switch the tour to Published in the editor, then share the public URL — visitors don't need an account to view it."
        )
    ]

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 0)

            Image(systemName: Self.steps[stepIndex].symbol)
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .symbolRenderingMode(.hierarchical)

            VStack(spacing: 12) {
                Text("Welcome to CloudTour")
                    .font(.title)
                    .fontWeight(.semibold)
                Text(Self.steps[stepIndex].title)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text(Self.steps[stepIndex].body)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                ForEach(Self.steps.indices, id: \.self) { i in
                    Circle()
                        .fill(i == stepIndex ? Color.accentColor : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }
            .accessibilityHidden(true)

            HStack(spacing: 16) {
                Button("Skip", action: onSkip)
                    .buttonStyle(.bordered)
                    .accessibilityHint("Dismiss onboarding and use the dashboard")
                if stepIndex < Self.steps.count - 1 {
                    Button("Next") {
                        withAnimation(.smooth) { stepIndex += 1 }
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityHint("Advance to next onboarding step")
                } else {
                    Button("Create Tour") {
                        onSkip()
                        onCreateTour()
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityHint("Finish onboarding and create your first tour")
                }
            }

            Spacer(minLength: 0)
        }
        .padding(48)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
