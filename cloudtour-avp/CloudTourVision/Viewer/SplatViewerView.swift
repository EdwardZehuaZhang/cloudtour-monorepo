import SwiftUI
import Supabase

struct SplatViewerView: View {
    let scenes: [Scene]
    let tourOrgId: UUID
    let tourId: UUID

    @State private var currentScene: Scene
    @State private var fileURL: URL?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var waypoints: [Waypoint] = []
    @State private var isImmersiveOpen = false
    @State private var isEditingMode = false
    @State private var activeTool: ToolMode = .calibrate
    @State private var selectedTargetSceneId: UUID? = nil
    @State private var brushRadius: Float = 0.15
    @State private var saveError: String?
    @State private var isSaving = false
    @State private var pendingAutoReenter = false
    private let loadState = SplatLoadState.shared
    private let waypointSelection = WaypointSelectionState.shared
    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

    init(scene: Scene, scenes: [Scene] = [], tourOrgId: UUID, tourId: UUID) {
        self.tourOrgId = tourOrgId
        self.tourId = tourId
        self.scenes = scenes.isEmpty ? [scene] : scenes
        self._currentScene = State(initialValue: scene)
    }

    var body: some View {
        ZStack {
            if isImmersiveOpen {
                switch loadState.phase {
                case .idle, .loading:
                    immersiveLoadingView
                case .ready:
                    immersiveActiveView
                case .failed(let message):
                    immersiveFailedView(message: message)
                }
            } else if isLoading {
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

                    Text(currentScene.title)
                        .font(.title)
                        .fontWeight(.bold)

                    if let desc = currentScene.description {
                        Text(desc)
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 16) {
                        Button {
                            enterImmersive(editMode: false)
                        } label: {
                            Label("View", systemImage: "visionpro")
                                .font(.headline)
                                .padding()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(fileURL == nil)

                        Button {
                            enterImmersive(editMode: true)
                        } label: {
                            Label(
                                currentScene.sceneEdits == nil ? "Calibrate" : "Edit",
                                systemImage: "ruler"
                            )
                            .font(.headline)
                            .padding()
                        }
                        .buttonStyle(.bordered)
                        .disabled(fileURL == nil)
                    }
                }
                .padding()

                WaypointOverlay(waypoints: waypoints) { waypoint in
                    handleWaypointSelection(targetSceneId: waypoint.targetSceneId)
                }
            }
        }
        .navigationTitle(currentScene.title)
        .toolbar(isImmersiveOpen ? .hidden : .visible, for: .navigationBar)
        .task(id: currentScene.id) {
            isLoading = true
            fileURL = nil
            await loadSplatFile()
            await loadWaypoints()
            if pendingAutoReenter, fileURL != nil, !isImmersiveOpen {
                pendingAutoReenter = false
                enterImmersive()
            }
        }
        .onChange(of: waypointSelection.pendingTargetSceneId) { _, newValue in
            guard let targetId = newValue else { return }
            waypointSelection.clear()
            handleWaypointSelection(targetSceneId: targetId)
        }
    }

    private func handleWaypointSelection(targetSceneId: UUID) {
        guard let nextScene = scenes.first(where: { $0.id == targetSceneId }),
              nextScene.id != currentScene.id else { return }

        if isImmersiveOpen {
            pendingAutoReenter = true
            Task {
                await dismissImmersiveSpace()
                await MainActor.run {
                    isImmersiveOpen = false
                    loadState.set(.idle)
                    currentScene = nextScene
                }
            }
        } else {
            currentScene = nextScene
        }
    }

    private func enterImmersive(editMode: Bool = false) {
        guard let url = fileURL else { return }
        loadState.set(.loading)
        isImmersiveOpen = true
        isEditingMode = editMode || currentScene.sceneEdits == nil
        saveError = nil
        // Renderer always boots into `.calibrate` when entering edit mode;
        // mirror that here so the segmented picker matches the renderer
        // state on first frame.
        if isEditingMode {
            activeTool = .calibrate
        }
        // Default target scene = first OTHER scene in the tour, or self if
        // there's only one (same-scene bookmark).
        if selectedTargetSceneId == nil {
            selectedTargetSceneId = scenes.first(where: { $0.id != currentScene.id })?.id ?? currentScene.id
        }
        let markers = waypoints.map(WaypointMarker.init(from:))
        let session = SplatSession(
            url: url,
            sceneId: currentScene.id,
            tourId: tourId,
            orgId: tourOrgId,
            editMode: isEditingMode,
            sceneEdits: currentScene.sceneEdits,
            waypoints: markers
        )
        Task {
            let result = await openImmersiveSpace(value: session)
            if case .error = result {
                loadState.set(.failed("Could not open immersive space."))
            }
        }
    }

    private func exitImmersive() {
        Task {
            await dismissImmersiveSpace()
            isImmersiveOpen = false
            isEditingMode = false
            loadState.set(.idle)
        }
    }

    /// Unified Save: persists the live-calibrated transform AND any pending
    /// waypoints + arrival-yaw updates accumulated during this immersive
    /// session. Direct Supabase writes (RLS-gated). The BE version-check
    /// route is bypassed for now; conflict UI ships in M5.
    private func saveAll() {
        guard let renderer = SplatImmersiveRenderer.currentRenderer else {
            saveError = "Renderer not running"
            return
        }
        let didCalibrate = renderer.hasUserAdjustedTransform()
        if currentScene.sceneEdits == nil, !didCalibrate {
            saveError = "Calibrate the splat against the silhouette before saving."
            return
        }
        let transform = renderer.snapshotTransform()
        let waypointEdits = renderer.snapshotWaypointEdits()
        let pendingDeletions = renderer.snapshotPendingDeletions()
        let needsSceneEditsSave = didCalibrate
            || currentScene.sceneEdits == nil
            || !pendingDeletions.isEmpty
        let oldVersion = currentScene.sceneEdits?.version ?? 0

        isSaving = true
        saveError = nil

        Task {
            do {
                if needsSceneEditsSave {
                    // Merge any new in-session brush spheres onto the
                    // already-committed deletions.
                    let existing = currentScene.sceneEdits?.deletions ?? .empty
                    let mergedSpheres = (existing.spheres ?? []) + pendingDeletions
                    let mergedDeletions = SceneDeletions(
                        indices: existing.indices,
                        spheres: mergedSpheres.isEmpty ? nil : mergedSpheres,
                        boxes: existing.boxes,
                        lassos: existing.lassos
                    )
                    let newEdits = SceneEdits(
                        version: oldVersion + 1,
                        transform: transform,
                        deletions: mergedDeletions
                    )
                    struct SceneEditsUpdate: Encodable { let scene_edits: SceneEdits }
                    let updated: Scene = try await AppSupabase.client
                        .from("scenes")
                        .update(SceneEditsUpdate(scene_edits: newEdits))
                        .eq("id", value: currentScene.id.uuidString)
                        .select()
                        .single()
                        .execute()
                        .value
                    await MainActor.run { currentScene = updated }
                }

                if !waypointEdits.pending.isEmpty {
                    guard let targetSceneId = selectedTargetSceneId else {
                        await MainActor.run {
                            saveError = "Pick a target scene for new waypoints."
                            isSaving = false
                        }
                        return
                    }
                    let baseLabelIndex = waypoints.count
                    for (offset, pending) in waypointEdits.pending.enumerated() {
                        struct WaypointInsert: Encodable {
                            let scene_id: String
                            let target_scene_id: String
                            let label: String
                            let position_3d: Position3D
                            let target_position_3d: Position3D?
                            let target_yaw: Float?
                        }
                        let pos = Position3D(
                            x: Double(pending.localPosition.x),
                            y: Double(pending.localPosition.y),
                            z: Double(pending.localPosition.z)
                        )
                        let row = WaypointInsert(
                            scene_id: currentScene.id.uuidString,
                            target_scene_id: targetSceneId.uuidString,
                            label: "Waypoint \(baseLabelIndex + offset + 1)",
                            position_3d: pos,
                            target_position_3d: nil,
                            target_yaw: pending.targetYaw
                        )
                        try await AppSupabase.client
                            .from("waypoints")
                            .insert(row)
                            .execute()
                    }
                }

                for (waypointId, yaw) in waypointEdits.yawUpdates {
                    struct YawUpdate: Encodable { let target_yaw: Float }
                    try await AppSupabase.client
                        .from("waypoints")
                        .update(YawUpdate(target_yaw: yaw))
                        .eq("id", value: waypointId.uuidString)
                        .execute()
                }

                renderer.clearWaypointEdits()
                renderer.clearPendingDeletions()
                await loadWaypoints()
                await MainActor.run {
                    isSaving = false
                    // Brush deletions only re-cull on splat reload, so dismiss
                    // the immersive space — the user re-enters View to see the
                    // cleaned splat.
                    exitImmersive()
                }
            } catch {
                await MainActor.run {
                    saveError = "Save failed: \(error.localizedDescription)"
                    isSaving = false
                }
            }
        }
    }

    private func recalibrate() {
        SplatImmersiveRenderer.currentRenderer?.resetTransform(to: .identity)
        SplatImmersiveRenderer.currentRenderer?.setActiveTool(.calibrate)
        activeTool = .calibrate
    }

    private func selectTool(_ tool: ToolMode) {
        activeTool = tool
        SplatImmersiveRenderer.currentRenderer?.setActiveTool(tool)
    }

    private var immersiveLoadingView: some View {
        VStack(spacing: 32) {
            ProgressView()
                .scaleEffect(2)
                .controlSize(.extraLarge)

            VStack(spacing: 8) {
                Text(currentScene.title)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text("Preparing immersive scene…")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            Button(role: .cancel) {
                exitImmersive()
            } label: {
                Label("Cancel", systemImage: "xmark.circle")
                    .font(.title3)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(48)
    }

    private var immersiveActiveView: some View {
        VStack(spacing: 28) {
            Image(systemName: isEditingMode ? "ruler.fill" : "visionpro.fill")
                .font(.system(size: 84))
                .foregroundStyle(.tint)

            VStack(spacing: 8) {
                Text(currentScene.title)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text(isEditingMode ? "Calibrating scene scale" : "Immersive view is active")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }

            if isEditingMode {
                editingInstructions
                editingControls
            } else {
                if !waypoints.isEmpty {
                    Text("Aim at a waypoint and pinch to teleport")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                }
                Button(role: .destructive) {
                    exitImmersive()
                } label: {
                    Label("Exit Immersive View", systemImage: "xmark.circle.fill")
                        .font(.title2)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.extraLarge)
            }

            #if targetEnvironment(simulator)
            VStack(spacing: 8) {
                Divider()
                    .padding(.horizontal, 48)
                Text("Simulator Debug")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Button {
                    SplatImmersiveRenderer.debugTriggerPinch()
                } label: {
                    Label("Simulate Pinch (dolly forward)", systemImage: "hand.pinch.fill")
                        .font(.callout)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)
            }
            .padding(.top, 16)
            #endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(48)
    }

    @ViewBuilder
    private var editingInstructions: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch activeTool {
            case .calibrate:
                Text("Calibrate against the human silhouette")
                    .font(.headline)
                Text("• Two-hand pinch + spread to scale the splat")
                Text("• Two-hand twist to rotate around vertical")
                Text("• One-hand pinch + drag to translate")
            case .waypoint:
                Text("Place waypoints inside the scene")
                    .font(.headline)
                Text("• Aim where you want a waypoint, then pinch")
                Text("• Pinch again on a placed waypoint to set arrival yaw")
                Text("• Existing waypoints: aim + pinch updates their yaw")
            case .view:
                Text("Viewing")
                    .font(.headline)
            case .brush:
                Text("Erase splat regions")
                    .font(.headline)
                Text("• Move your hand to position the red brush sphere")
                Text("• Pinch to mark that volume for deletion")
                Text("• Save commits the removals — splat re-loads cleaned")
            case .box:
                Text("Box-select a region for deletion")
                    .font(.headline)
                Text("• Pinch left + right hands to anchor opposite corners")
                Text("• Release to commit the box volume for deletion")
                Text("• Save commits the removals — splat re-loads cleaned")
            case .lasso:
                Text("Lasso-select a region for deletion")
                    .font(.headline)
                Text("• Pinch + drag to draw a 2D lasso around the area")
                Text("• Release to commit the lasso volume for deletion")
                Text("• Save commits the removals — splat re-loads cleaned")
            }
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .frame(maxWidth: 520, alignment: .leading)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var editingControls: some View {
        VStack(spacing: 16) {
            // Tool picker
            Picker("Tool", selection: Binding(
                get: { activeTool },
                set: { newValue in selectTool(newValue) }
            )) {
                Label("Calibrate", systemImage: "ruler").tag(ToolMode.calibrate)
                Label("Waypoint", systemImage: "mappin.and.ellipse").tag(ToolMode.waypoint)
                Label("Brush", systemImage: "paintbrush.pointed").tag(ToolMode.brush)
                Label("Box", systemImage: "cube.transparent").tag(ToolMode.box)
                Label("Lasso", systemImage: "lasso").tag(ToolMode.lasso)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 520)

            // Waypoint-mode target scene picker
            if activeTool == .waypoint, !scenes.isEmpty {
                HStack(spacing: 12) {
                    Text("New waypoints lead to:")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Picker("Target scene", selection: Binding(
                        get: { selectedTargetSceneId ?? currentScene.id },
                        set: { selectedTargetSceneId = $0 }
                    )) {
                        ForEach(scenes, id: \.id) { scene in
                            Text(scene.title)
                                .tag(scene.id)
                        }
                    }
                    .pickerStyle(.menu)
                }
                .frame(maxWidth: 520)
            }

            // Brush-mode radius slider
            if activeTool == .brush {
                HStack(spacing: 12) {
                    Text("Brush size:")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: Binding(
                            get: { brushRadius },
                            set: { newValue in
                                brushRadius = newValue
                                SplatImmersiveRenderer.currentRenderer?.setBrushRadius(newValue)
                            }
                        ),
                        in: 0.03...0.50
                    )
                    Text(String(format: "%.2f m", brushRadius))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .frame(width: 64, alignment: .trailing)
                }
                .frame(maxWidth: 520)
            }

            HStack(spacing: 16) {
                Button {
                    saveAll()
                } label: {
                    Label("Save", systemImage: "checkmark.circle.fill")
                        .font(.title3)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSaving)

                if activeTool == .calibrate {
                    Button {
                        recalibrate()
                    } label: {
                        Label("Reset", systemImage: "arrow.counterclockwise")
                            .font(.title3)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isSaving)
                }

                Button(role: .cancel) {
                    exitImmersive()
                } label: {
                    Label("Cancel", systemImage: "xmark.circle")
                        .font(.title3)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isSaving)
            }

            if let saveError {
                Text(saveError)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 520)
            }
        }
    }

    private func immersiveFailedView(message: String) -> some View {
        VStack(spacing: 24) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.red)

            VStack(spacing: 8) {
                Text("Failed to load scene")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text(message)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Button {
                exitImmersive()
            } label: {
                Label("Exit", systemImage: "xmark.circle.fill")
                    .font(.title2)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.extraLarge)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(48)
    }

    private func loadSplatFile() async {
        let ext = currentScene.splatFileFormat ?? "splat"
        let cache = SplatCache.shared

        if let cached = await cache.getCachedFile(for: currentScene.id, extension: ext) {
            fileURL = cached
            isLoading = false
            return
        }

        do {
            let downloadURL = try await resolveSplatURL(ext: ext)
            let (data, _) = try await URLSession.shared.data(from: downloadURL)
            let localURL = try await cache.cacheFile(data: data, for: currentScene.id, extension: ext)
            fileURL = localURL
            errorMessage = nil
        } catch {
            errorMessage = "Failed to load splat: \(error.localizedDescription)"
        }
        isLoading = false
    }

    /// Resolves the splat file URL. Prefers the canonical `splat_url` column
    /// written by the web uploader; falls back to the legacy derived storage
    /// path only if the column is missing or malformed.
    private func resolveSplatURL(ext: String) async throws -> URL {
        if let urlString = currentScene.splatUrl,
           let url = URL(string: urlString),
           let scheme = url.scheme,
           scheme == "http" || scheme == "https" {
            return url
        }

        let storagePath = "\(tourOrgId.uuidString)/\(tourId.uuidString)/\(currentScene.id.uuidString)/scene.\(ext)"
        return try await AppSupabase.client.storage
            .from("splat-files")
            .createSignedURL(path: storagePath, expiresIn: 3600)
    }

    private func loadWaypoints() async {
        do {
            waypoints = try await AppSupabase.client
                .from("waypoints")
                .select()
                .eq("scene_id", value: currentScene.id.uuidString)
                .execute()
                .value
        } catch {
            waypoints = []
        }
    }
}
