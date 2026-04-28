import SwiftUI

struct TourDetailView: View {
    @Bindable var viewModel: TourDetailViewModel
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @State private var showingUpload = false

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView("Loading scenes…")
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let coverURL = viewModel.tour.coverImageUrl.flatMap({ URL(string: $0) }) {
                            AsyncImage(url: coverURL) { image in
                                image.resizable().aspectRatio(contentMode: .fill)
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(.quaternary)
                                    .frame(height: 200)
                            }
                            .frame(maxWidth: .infinity, maxHeight: 200)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(viewModel.tour.title)
                                .font(.largeTitle)
                                .fontWeight(.bold)

                            if let desc = viewModel.tour.description {
                                Text(desc)
                                    .font(.body)
                                    .foregroundStyle(.secondary)
                            }

                            HStack(spacing: 16) {
                                if let location = viewModel.tour.location {
                                    Label(location, systemImage: "location")
                                }
                                if let category = viewModel.tour.category {
                                    Label(category, systemImage: "tag")
                                }
                                Label("\(viewModel.tour.viewCount) views", systemImage: "eye")
                            }
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        }

                        Divider()

                        HStack {
                            Text("Scenes")
                                .font(.title2)
                                .fontWeight(.semibold)
                            Spacer()
                            Button {
                                showingUpload = true
                            } label: {
                                Label("Upload splat", systemImage: "square.and.arrow.up")
                                    .font(.callout)
                            }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Upload a splat file from device")
                            .accessibilityHint("Pick a .ply, .splat, or .spz file to attach as a new scene")
                        }

                        if viewModel.scenes.isEmpty {
                            ContentUnavailableView("No Scenes", systemImage: "cube.transparent", description: Text("This tour has no scenes yet."))
                        } else {
                            ForEach(viewModel.scenes) { scene in
                                NavigationLink {
                                    SplatViewerView(
                                        scene: scene,
                                        scenes: viewModel.scenes,
                                        tourOrgId: viewModel.tour.orgId,
                                        tourId: viewModel.tour.id
                                    )
                                } label: {
                                    SceneRowView(scene: scene)
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle(viewModel.tour.title)
        .task {
            await viewModel.loadScenes()
            if viewModel.scenes.count == 1, let scene = viewModel.scenes.first {
                viewModel.autoNavigateScene = scene
            }
        }
        .sheet(isPresented: $showingUpload) {
            SplatUploadView(tour: viewModel.tour) { _ in
                Task { await viewModel.loadScenes() }
            }
        }
    }
}

struct SceneRowView: View {
    let scene: Scene

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: "cube.transparent")
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 60, height: 60)
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(scene.title)
                    .font(.headline)
                if let desc = scene.description {
                    Text(desc)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 6)
        .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 12))
        .hoverEffect(.highlight)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(scene.title)
        .accessibilityHint("Open scene in immersive viewer")
    }
}
