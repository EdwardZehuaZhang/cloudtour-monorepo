import SwiftUI

struct TourDetailView: View {
    @Bindable var viewModel: TourDetailViewModel
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace

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

                        Text("Scenes")
                            .font(.title2)
                            .fontWeight(.semibold)

                        if viewModel.scenes.isEmpty {
                            ContentUnavailableView("No Scenes", systemImage: "cube.transparent", description: Text("This tour has no scenes yet."))
                        } else {
                            ForEach(viewModel.scenes) { scene in
                                NavigationLink {
                                    SplatViewerView(scene: scene, tourOrgId: viewModel.tour.orgId, tourId: viewModel.tour.id)
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
    }
}

struct SceneRowView: View {
    let scene: Scene

    var body: some View {
        HStack {
            Image(systemName: "cube.transparent")
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(scene.name)
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
        }
        .padding(.vertical, 6)
    }
}
