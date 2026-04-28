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

    /// M6.12 — switch to a 2D force-directed layout once a tour has more
    /// than 12 scenes. Below that the list view is more scannable; above
    /// that the list grows long enough to lose the global structure that a
    /// 2D layout makes visible.
    private static let layoutThreshold = 12

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if scenes.count > Self.layoutThreshold {
                ForceDirectedSceneGraph(
                    scenes: scenes,
                    waypoints: waypoints,
                    onSelectSource: onSelectSource
                )
            } else {
                Form {
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

                    if let errorMessage {
                        Section {
                            Text(errorMessage)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
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
            .padding(.vertical, 4)
            .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
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

// MARK: - M6.12 force-directed 2D layout

/// Lightweight Fruchterman–Reingold-ish layout. Runs synchronously in
/// `onAppear` for ~250 iterations on the scenes/waypoints set; the result
/// is a dictionary keyed by scene id mapping to a unit-square coordinate
/// (0–1) that the Canvas then maps onto the available frame.
struct ForceDirectedSceneGraph: View {
    let scenes: [Scene]
    let waypoints: [Waypoint]
    let onSelectSource: (Scene) -> Void

    @State private var positions: [UUID: CGPoint] = [:]

    var body: some View {
        GeometryReader { geo in
            let bounds = geo.size
            ZStack {
                // Edges (drawn first so nodes overlay them).
                Canvas { ctx, _ in
                    for wp in waypoints {
                        guard let from = positions[wp.sceneId],
                              let to = positions[wp.targetSceneId] else { continue }
                        var path = Path()
                        let p1 = mapPoint(from, in: bounds)
                        let p2 = mapPoint(to, in: bounds)
                        path.move(to: p1)
                        path.addLine(to: p2)
                        ctx.stroke(path, with: .color(Color.accentColor.opacity(0.45)), lineWidth: 1.2)
                        // Arrow head — short cap perpendicular to direction.
                        let dx = p2.x - p1.x, dy = p2.y - p1.y
                        let len = max(sqrt(dx * dx + dy * dy), 0.001)
                        let ux = dx / len, uy = dy / len
                        let tip = CGPoint(x: p2.x - ux * 18, y: p2.y - uy * 18)
                        let perpX = -uy, perpY = ux
                        var arrow = Path()
                        arrow.move(to: p2)
                        arrow.addLine(to: CGPoint(x: tip.x + perpX * 6, y: tip.y + perpY * 6))
                        arrow.addLine(to: CGPoint(x: tip.x - perpX * 6, y: tip.y - perpY * 6))
                        arrow.closeSubpath()
                        ctx.fill(arrow, with: .color(Color.accentColor.opacity(0.7)))
                    }
                }
                // Nodes — Buttons so the tap target works for VoiceOver.
                ForEach(scenes) { scene in
                    if let pos = positions[scene.id] {
                        let p = mapPoint(pos, in: bounds)
                        Button {
                            onSelectSource(scene)
                        } label: {
                            Text(scene.title)
                                .font(.caption)
                                .lineLimit(1)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(.thinMaterial, in: Capsule())
                                .contentShape(.hoverEffect, Capsule())
                        }
                        .buttonStyle(.plain)
                        .hoverEffect(.lift)
                        .position(x: p.x, y: p.y)
                        .accessibilityLabel(scene.title)
                        .accessibilityHint("Open this scene in the editor")
                    }
                }
            }
            .onAppear { compute(in: bounds) }
            .onChange(of: scenes.count) { _, _ in compute(in: bounds) }
            .onChange(of: waypoints.count) { _, _ in compute(in: bounds) }
        }
    }

    /// Map a unit-square (0–1) coordinate onto the available bounds with a
    /// 40 pt inset so node capsules don't clip the edges.
    private func mapPoint(_ p: CGPoint, in size: CGSize) -> CGPoint {
        let inset: CGFloat = 40
        let w = max(size.width - inset * 2, 100)
        let h = max(size.height - inset * 2, 100)
        return CGPoint(x: inset + p.x * w, y: inset + p.y * h)
    }

    /// Run the simulation. Cheap enough (O(N² · iterations)) that we don't
    /// bother dispatching off-main: 30 scenes × 250 iters × 30 = 225 k ops.
    private func compute(in size: CGSize) {
        guard !scenes.isEmpty else { positions = [:]; return }
        // Seed positions on a circle so the first iteration has structure.
        let n = scenes.count
        let radius: CGFloat = 0.30
        let centre = CGPoint(x: 0.5, y: 0.5)
        var pos: [UUID: SIMD2<Double>] = [:]
        for (i, s) in scenes.enumerated() {
            let theta = 2 * .pi * Double(i) / Double(n)
            pos[s.id] = SIMD2(
                Double(centre.x) + Double(radius) * cos(theta),
                Double(centre.y) + Double(radius) * sin(theta)
            )
        }

        // Build adjacency once.
        var adjacency: [(UUID, UUID)] = []
        let ids = Set(scenes.map(\.id))
        for wp in waypoints where ids.contains(wp.sceneId) && ids.contains(wp.targetSceneId) {
            adjacency.append((wp.sceneId, wp.targetSceneId))
        }

        let iterations = 250
        // Optimal edge length for unit-square layout. Shrinks with more
        // nodes so dense graphs don't push everything to the edges.
        let k = sqrt(1.0 / Double(n)) * 0.8
        var temperature = 0.10

        for _ in 0..<iterations {
            var disp: [UUID: SIMD2<Double>] = [:]
            for s in scenes { disp[s.id] = .zero }
            // Repulsion (every pair).
            for i in 0..<n {
                for j in (i + 1)..<n {
                    let a = scenes[i].id, b = scenes[j].id
                    guard let pa = pos[a], let pb = pos[b] else { continue }
                    var d = pa - pb
                    let dist = max(simd_length(d), 1e-4)
                    d = d / dist
                    let force = (k * k) / dist
                    disp[a] = (disp[a] ?? .zero) + d * force
                    disp[b] = (disp[b] ?? .zero) - d * force
                }
            }
            // Attraction along edges.
            for (s, t) in adjacency {
                guard s != t, let pa = pos[s], let pb = pos[t] else { continue }
                var d = pa - pb
                let dist = max(simd_length(d), 1e-4)
                d = d / dist
                let force = (dist * dist) / k
                disp[s] = (disp[s] ?? .zero) - d * force
                disp[t] = (disp[t] ?? .zero) + d * force
            }
            // Apply with temperature; keep inside [0, 1] unit square.
            for s in scenes {
                guard let p = pos[s.id], let dv = disp[s.id] else { continue }
                let dist = simd_length(dv)
                let limited = dist > 0
                    ? dv / dist * min(dist, temperature)
                    : SIMD2<Double>.zero
                var np = p + limited
                np.x = min(max(np.x, 0.02), 0.98)
                np.y = min(max(np.y, 0.02), 0.98)
                pos[s.id] = np
            }
            temperature *= 0.985
        }

        var out: [UUID: CGPoint] = [:]
        for (id, p) in pos {
            out[id] = CGPoint(x: p.x, y: p.y)
        }
        positions = out
    }
}
