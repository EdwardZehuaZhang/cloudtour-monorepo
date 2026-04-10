import SwiftUI
import Supabase

struct SplatViewerView: View {
    let scene: Scene
    let tourOrgId: UUID
    let tourId: UUID

    @State private var fileURL: URL?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var waypoints: [Waypoint] = []
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

    var body: some View {
        ZStack {
            if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Downloading splat file…")
                        .foregroundStyle(.secondary)
                }
            } else if let error = errorMessage {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                VStack(spacing: 20) {
                    Image(systemName: "cube.transparent.fill")
                        .font(.system(size: 60))
                        .foregroundStyle(.tint)

                    Text(scene.name)
                        .font(.title)
                        .fontWeight(.bold)

                    if let desc = scene.description {
                        Text(desc)
                            .foregroundStyle(.secondary)
                    }

                    Button {
                        Task {
                            if let url = fileURL {
                                await openImmersiveSpace(value: SplatFileIdentifier(url: url))
                            }
                        }
                    } label: {
                        Label("Enter Immersive View", systemImage: "visionpro")
                            .font(.headline)
                            .padding()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(fileURL == nil)
                }
                .padding()

                WaypointOverlay(waypoints: waypoints) { waypoint in
                    // Waypoint navigation handled by parent
                }
            }
        }
        .navigationTitle(scene.name)
        .task {
            await loadSplatFile()
            await loadWaypoints()
        }
    }

    private func loadSplatFile() async {
        let ext = scene.splatFileExtension ?? "splat"
        let cache = SplatCache.shared

        if let cached = await cache.getCachedFile(for: scene.id, extension: ext) {
            fileURL = cached
            isLoading = false
            return
        }

        let storagePath = "\(tourOrgId.uuidString)/\(tourId.uuidString)/\(scene.id.uuidString)/scene.\(ext)"
        do {
            let signedURL = try await AppSupabase.client.storage
                .from("splat-files")
                .createSignedURL(path: storagePath, expiresIn: 3600)

            let (data, _) = try await URLSession.shared.data(from: signedURL)
            let localURL = try await cache.cacheFile(data: data, for: scene.id, extension: ext)
            fileURL = localURL
        } catch {
            errorMessage = "Failed to load splat: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func loadWaypoints() async {
        do {
            waypoints = try await AppSupabase.client
                .from("waypoints")
                .select()
                .eq("scene_id", value: scene.id.uuidString)
                .execute()
                .value
        } catch {
            // Waypoints are optional, don't block the view
        }
    }
}
