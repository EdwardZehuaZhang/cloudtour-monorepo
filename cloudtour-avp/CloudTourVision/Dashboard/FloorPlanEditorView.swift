import SwiftUI
import Supabase

/// M7.4 — drag scenes onto a 2D canvas, persist normalized [0..1]
/// positions to the tour's floor_plans row. Snap-to-grid (5%) and
/// system UndoManager (Cmd-Z / Cmd-Shift-Z) are wired through SwiftUI's
/// `@Environment(\.undoManager)`.
struct FloorPlanEditorView: View {
    let tour: Tour

    @Environment(\.undoManager) private var undoManager
    @Environment(\.dismissWindow) private var dismissWindow
    @State private var scenes: [Scene] = []
    @State private var positions: [UUID: ScenePosition] = [:]
    @State private var floorPlanId: UUID? = nil
    @State private var snapEnabled: Bool = true
    @State private var isLoading: Bool = true
    @State private var isSaving: Bool = false
    @State private var errorMessage: String?
    /// Captured on the first `onChanged` of a drag so undo restores to the
    /// pre-drag positions, not the post-drag mutation. Cleared on `onEnded`.
    @State private var dragStartSnapshot: [UUID: ScenePosition]?

    private static let gridFraction: Double = 0.05

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            GeometryReader { geo in
                canvas(in: geo.size)
            }
        }
        .navigationTitle("Floor plan — \(tour.title)")
        .frame(minWidth: 720, minHeight: 540)
        .task {
            await loadScenesAndPlan()
        }
    }

    @ViewBuilder
    private var toolbar: some View {
        HStack(spacing: 12) {
            Toggle(isOn: $snapEnabled) {
                Label("Snap", systemImage: "square.grid.4x3.fill")
            }
            .toggleStyle(.button)

            Divider().frame(height: 24)

            Button {
                undoManager?.undo()
            } label: {
                Label("Undo", systemImage: "arrow.uturn.backward")
            }
            .disabled(undoManager?.canUndo != true)
            .keyboardShortcut("z", modifiers: .command)

            Button {
                undoManager?.redo()
            } label: {
                Label("Redo", systemImage: "arrow.uturn.forward")
            }
            .disabled(undoManager?.canRedo != true)
            .keyboardShortcut("z", modifiers: [.command, .shift])

            Spacer()

            if let err = errorMessage {
                Label(err, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            if isSaving {
                ProgressView().controlSize(.small)
            }
            Button {
                Task { await save() }
            } label: {
                Label("Save", systemImage: "tray.and.arrow.down.fill")
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSaving || isLoading)
        }
        .padding(16)
    }

    @ViewBuilder
    private func canvas(in size: CGSize) -> some View {
        ZStack {
            // Grid backdrop. Painted into a Canvas so the drag layer
            // overlay does not have to redraw the grid on each tick.
            Canvas { ctx, canvasSize in
                let step = canvasSize.width * Self.gridFraction
                ctx.stroke(
                    Path { path in
                        var x = step
                        while x < canvasSize.width {
                            path.move(to: CGPoint(x: x, y: 0))
                            path.addLine(to: CGPoint(x: x, y: canvasSize.height))
                            x += step
                        }
                        var y = step
                        while y < canvasSize.height {
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: canvasSize.width, y: y))
                            y += step
                        }
                    },
                    with: .color(Color.secondary.opacity(0.15)),
                    lineWidth: 0.5
                )
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))

            ForEach(scenes) { scene in
                sceneNode(scene: scene, canvasSize: size)
            }
        }
        .padding(16)
    }

    @ViewBuilder
    private func sceneNode(scene: Scene, canvasSize: CGSize) -> some View {
        let pos = positions[scene.id] ?? ScenePosition(sceneId: scene.id, x: 0.5, y: 0.5)
        let cx = pos.x * canvasSize.width
        let cy = pos.y * canvasSize.height

        VStack(spacing: 4) {
            Image(systemName: "cube.transparent.fill")
                .font(.title2)
                .foregroundStyle(Color.accentColor)
                .frame(width: 60, height: 60)
                .background(.thinMaterial, in: Circle())
            Text(scene.title)
                .font(.caption)
                .lineLimit(1)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.thinMaterial, in: Capsule())
        }
        .position(x: cx, y: cy)
        .accessibilityLabel("\(scene.title) at x \(Int(pos.x * 100)) percent, y \(Int(pos.y * 100)) percent")
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if dragStartSnapshot == nil { dragStartSnapshot = positions }
                    let normX = clamp(Double(value.location.x / canvasSize.width))
                    let normY = clamp(Double(value.location.y / canvasSize.height))
                    let snapped = applySnap(x: normX, y: normY)
                    positions[scene.id] = ScenePosition(
                        sceneId: scene.id,
                        x: snapped.0,
                        y: snapped.1
                    )
                }
                .onEnded { _ in
                    if let before = dragStartSnapshot, before != positions {
                        registerUndo(beforeSnapshot: before)
                    }
                    dragStartSnapshot = nil
                }
        )
        .hoverEffect(.lift)
    }

    private func clamp(_ v: Double) -> Double { min(1, max(0, v)) }

    private func applySnap(x: Double, y: Double) -> (Double, Double) {
        guard snapEnabled else { return (x, y) }
        let step = Self.gridFraction
        return ((x / step).rounded() * step, (y / step).rounded() * step)
    }

    private func registerUndo(beforeSnapshot: [UUID: ScenePosition]) {
        guard let undoManager else { return }
        let after = positions
        undoManager.registerUndo(withTarget: PositionsBox(view: self)) { _ in
            self.positions = beforeSnapshot
            self.registerRedo(afterSnapshot: after, beforeSnapshot: beforeSnapshot)
        }
    }

    private func registerRedo(afterSnapshot: [UUID: ScenePosition], beforeSnapshot: [UUID: ScenePosition]) {
        guard let undoManager else { return }
        undoManager.registerUndo(withTarget: PositionsBox(view: self)) { _ in
            self.positions = afterSnapshot
            self.registerUndo(beforeSnapshot: beforeSnapshot)
        }
    }

    // Targets passed to UndoManager must be class instances; SwiftUI views
    // are values. PositionsBox is a thin reference wrapper so the undo
    // registration has something stable to retain.
    private final class PositionsBox {
        let view: FloorPlanEditorView
        init(view: FloorPlanEditorView) { self.view = view }
    }

    private func loadScenesAndPlan() async {
        isLoading = true
        defer { isLoading = false }
        do {
            scenes = try await AppSupabase.client
                .from("scenes")
                .select()
                .eq("tour_id", value: tour.id.uuidString)
                .order("sort_order")
                .execute()
                .value

            let plans: [FloorPlan] = try await AppSupabase.client
                .from("floor_plans")
                .select()
                .eq("tour_id", value: tour.id.uuidString)
                .limit(1)
                .execute()
                .value
            if let existing = plans.first {
                floorPlanId = existing.id
                positions = Dictionary(uniqueKeysWithValues: existing.scenePositions.map { ($0.sceneId, $0) })
            }
        } catch {
            errorMessage = "Failed to load: \(error.localizedDescription)"
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let scenePositions = scenes.compactMap { scene -> ScenePosition? in
            positions[scene.id]
        }
        do {
            if let id = floorPlanId {
                struct Patch: Encodable { let scene_positions: [ScenePosition] }
                try await AppSupabase.client
                    .from("floor_plans")
                    .update(Patch(scene_positions: scenePositions))
                    .eq("id", value: id.uuidString)
                    .execute()
            } else {
                struct NewRow: Encodable {
                    let tour_id: String
                    let image_url: String
                    let scene_positions: [ScenePosition]
                }
                let row = NewRow(
                    tour_id: tour.id.uuidString,
                    image_url: "",
                    scene_positions: scenePositions
                )
                let inserted: [FloorPlan] = try await AppSupabase.client
                    .from("floor_plans")
                    .insert(row)
                    .select()
                    .execute()
                    .value
                floorPlanId = inserted.first?.id
            }
            errorMessage = nil
        } catch {
            errorMessage = "Save failed: \(error.localizedDescription)"
        }
    }
}
