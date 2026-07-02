import SwiftUI
import Supabase

struct WaypointEditorView: View {
    let scene: Scene
    let allScenes: [Scene]

    @State private var waypoints: [Waypoint] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var editingWaypoint: Waypoint?
    @State private var isPresentingNewForm = false

    private var targetScenes: [Scene] {
        allScenes.filter { $0.id != scene.id }
    }

    var body: some View {
        Form {
            if isLoading {
                Section { ProgressView() }
            } else {
                Section("Waypoints") {
                    if waypoints.isEmpty {
                        Text("No waypoints")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(waypoints) { wp in
                            Button {
                                editingWaypoint = wp
                            } label: {
                                WaypointRow(waypoint: wp, allScenes: allScenes)
                            }
                            .buttonStyle(.plain)
                        }
                        .onDelete(perform: deleteWaypoints)
                    }
                }

                Section {
                    Button {
                        isPresentingNewForm = true
                    } label: {
                        Label("Add Waypoint", systemImage: "plus.circle.fill")
                    }
                    .disabled(targetScenes.isEmpty)
                    if targetScenes.isEmpty {
                        Text("Add another scene first to create a waypoint that links to it.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle("Waypoints — \(scene.title)")
        .task { await loadWaypoints() }
        .sheet(isPresented: $isPresentingNewForm) {
            WaypointFormView(
                title: "New Waypoint",
                initial: nil,
                sceneId: scene.id,
                targetScenes: targetScenes
            ) { draft in
                Task {
                    await insertWaypoint(draft)
                    isPresentingNewForm = false
                }
            } onCancel: {
                isPresentingNewForm = false
            }
        }
        .sheet(item: $editingWaypoint) { wp in
            WaypointFormView(
                title: "Edit Waypoint",
                initial: wp,
                sceneId: scene.id,
                targetScenes: targetScenes
            ) { draft in
                Task {
                    await updateWaypoint(id: wp.id, draft: draft)
                    editingWaypoint = nil
                }
            } onCancel: {
                editingWaypoint = nil
            }
        }
    }

    private func loadWaypoints() async {
        do {
            waypoints = try await AppSupabase.client
                .from("waypoints")
                .select()
                .eq("scene_id", value: scene.id.uuidString)
                .execute()
                .value
            errorMessage = nil
        } catch {
            errorMessage = "Failed to load waypoints: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func insertWaypoint(_ draft: WaypointDraft) async {
        struct NewRow: Encodable {
            let scene_id: String
            let target_scene_id: String
            let label: String
            let icon: String?
            let position_3d: Position3D
        }
        let row = NewRow(
            scene_id: scene.id.uuidString,
            target_scene_id: draft.targetSceneId.uuidString,
            label: draft.label,
            icon: draft.icon,
            position_3d: draft.position
        )
        do {
            try await AppSupabase.client
                .from("waypoints")
                .insert(row)
                .execute()
            await loadWaypoints()
        } catch {
            errorMessage = "Failed to add waypoint: \(error.localizedDescription)"
        }
    }

    private func updateWaypoint(id: UUID, draft: WaypointDraft) async {
        struct UpdateRow: Encodable {
            let target_scene_id: String
            let label: String
            let icon: String?
            let position_3d: Position3D
        }
        let row = UpdateRow(
            target_scene_id: draft.targetSceneId.uuidString,
            label: draft.label,
            icon: draft.icon,
            position_3d: draft.position
        )
        do {
            try await AppSupabase.client
                .from("waypoints")
                .update(row)
                .eq("id", value: id.uuidString)
                .execute()
            await loadWaypoints()
        } catch {
            errorMessage = "Failed to update waypoint: \(error.localizedDescription)"
        }
    }

    private func deleteWaypoints(at offsets: IndexSet) {
        let toDelete = offsets.map { waypoints[$0] }
        Task {
            for wp in toDelete {
                do {
                    try await AppSupabase.client
                        .from("waypoints")
                        .delete()
                        .eq("id", value: wp.id.uuidString)
                        .execute()
                } catch {
                    errorMessage = "Failed to delete waypoint: \(error.localizedDescription)"
                }
            }
            await loadWaypoints()
        }
    }
}

struct WaypointDraft {
    var label: String
    var icon: String?
    var targetSceneId: UUID
    var position: Position3D
}

private struct WaypointRow: View {
    let waypoint: Waypoint
    let allScenes: [Scene]

    private var targetTitle: String {
        allScenes.first(where: { $0.id == waypoint.targetSceneId })?.title ?? "Unknown scene"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .foregroundStyle(.tint)
                Text(waypoint.label)
                    .font(.headline)
                Spacer()
                Text("→ \(targetTitle)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(String(
                format: "x %.2f  y %.2f  z %.2f",
                waypoint.position3D.x,
                waypoint.position3D.y,
                waypoint.position3D.z
            ))
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .monospacedDigit()
        }
        .padding(.vertical, 2)
    }
}

private struct WaypointFormView: View {
    let title: String
    let initial: Waypoint?
    let sceneId: UUID
    let targetScenes: [Scene]
    let onSave: (WaypointDraft) -> Void
    let onCancel: () -> Void

    @State private var label: String = ""
    @State private var icon: String = ""
    @State private var targetSceneId: UUID?
    @State private var x: Double = 0
    @State private var y: Double = 0
    @State private var z: Double = 0

    private var canSave: Bool {
        !label.trimmingCharacters(in: .whitespaces).isEmpty && targetSceneId != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Label") {
                    TextField("e.g. Living Room", text: $label)
                }

                Section("Target Scene") {
                    Picker("Goes to", selection: $targetSceneId) {
                        Text("Select…").tag(UUID?.none)
                        ForEach(targetScenes) { scene in
                            Text(scene.title).tag(UUID?.some(scene.id))
                        }
                    }
                }

                Section("Position") {
                    LabeledContent("X") {
                        TextField("0.0", value: $x, format: .number)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Y") {
                        TextField("0.0", value: $y, format: .number)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Z") {
                        TextField("0.0", value: $z, format: .number)
                            .multilineTextAlignment(.trailing)
                    }
                    Text("Coordinates use the splat's local space (same as the web editor).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Icon (optional)") {
                    TextField("SF Symbol or emoji", text: $icon)
                }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let targetSceneId else { return }
                        let trimmedIcon = icon.trimmingCharacters(in: .whitespaces)
                        onSave(WaypointDraft(
                            label: label.trimmingCharacters(in: .whitespaces),
                            icon: trimmedIcon.isEmpty ? nil : trimmedIcon,
                            targetSceneId: targetSceneId,
                            position: Position3D(x: x, y: y, z: z)
                        ))
                    }
                    .disabled(!canSave)
                }
            }
            .task {
                if let initial {
                    label = initial.label
                    icon = initial.icon ?? ""
                    targetSceneId = initial.targetSceneId
                    x = initial.position3D.x
                    y = initial.position3D.y
                    z = initial.position3D.z
                } else if targetSceneId == nil, let first = targetScenes.first {
                    targetSceneId = first.id
                }
            }
        }
    }
}
