import SwiftUI
import Supabase

/// M5.10 — flat graph view of every scene in a tour and the waypoints
/// linking them. Each scene is a node; each waypoint is a directed edge
/// `from-scene → to-scene`. Tapping an edge navigates to the source scene
/// in the editor (presented at the parent navigation stack).
///
/// Implementation note: this is a list-style "graph" rather than a 2D
/// node-link layout — it ships fast, scales to many scenes, and stays
/// readable on visionOS at typical window sizes. A 2D layout is a future
/// follow-up if the user asks for it.
struct WaypointGraphView: View {
    let scenes: [Scene]
    let onSelectSource: (Scene) -> Void

    @State private var waypoints: [Waypoint] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    private var sceneById: [UUID: Scene] {
        Dictionary(uniqueKeysWithValues: scenes.map { ($0.id, $0) })
    }

    /// `[sourceSceneId: [waypoint, ...]]`
    private var edgesGroupedBySource: [(source: Scene, edges: [Waypoint])] {
        let grouped = Dictionary(grouping: waypoints, by: { $0.sceneId })
        return scenes.compactMap { scene in
            guard let edges = grouped[scene.id], !edges.isEmpty else { return nil }
            return (scene, edges.sorted { $0.label < $1.label })
        }
    }

    private var orphanScenes: [Scene] {
        let sourcesWithEdges = Set(waypoints.map(\.sceneId))
        let targetsWithEdges = Set(waypoints.map(\.targetSceneId))
        let connected = sourcesWithEdges.union(targetsWithEdges)
        return scenes.filter { !connected.contains($0.id) }
    }

    var body: some View {
        Form {
            if isLoading {
                Section { ProgressView() }
            } else {
                ForEach(edgesGroupedBySource, id: \.source.id) { row in
                    Section(row.source.title) {
                        ForEach(row.edges) { wp in
                            edgeRow(wp)
                        }
                    }
                }

                if !orphanScenes.isEmpty {
                    Section {
                        ForEach(orphanScenes) { scene in
                            HStack {
                                Image(systemName: "circle.dotted")
                                    .foregroundStyle(.tertiary)
                                Text(scene.title)
                                Spacer()
                                Text("no links")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    } header: {
                        Text("Unlinked scenes")
                    } footer: {
                        Text("These scenes have no waypoints in or out. Open one in the editor to add a waypoint.")
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Scene graph")
        .task { await loadWaypoints() }
    }

    @ViewBuilder
    private func edgeRow(_ wp: Waypoint) -> some View {
        Button {
            if let source = sceneById[wp.sceneId] { onSelectSource(source) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "arrow.right.circle.fill")
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(wp.label)
                        .font(.callout)
                    let target = sceneById[wp.targetSceneId]?.title ?? "(missing)"
                    Text("→ \(target)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if wp.targetYaw != nil {
                    Image(systemName: "location.north.fill")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func loadWaypoints() async {
        isLoading = true
        defer { isLoading = false }
        let sceneIds = scenes.map { $0.id.uuidString }
        guard !sceneIds.isEmpty else { waypoints = []; return }
        do {
            let rows: [Waypoint] = try await AppSupabase.client
                .from("waypoints")
                .select()
                .in("scene_id", values: sceneIds)
                .execute()
                .value
            waypoints = rows
        } catch {
            errorMessage = "Failed to load waypoints: \(error.localizedDescription)"
        }
    }
}
