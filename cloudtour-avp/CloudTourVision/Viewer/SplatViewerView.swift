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
    /// Set by "Set starting view" button while in `.view` mode. Flushed to
    /// `scenes.default_camera_position` by `saveAll()` and cleared after
    /// successful PATCH.
    @State private var pendingStartingView: CameraPosition? = nil
    // M5.11 — display HUD toggles. Per-session only; not persisted.
    @State private var hudExpanded: Bool = false
    @State private var hideWaypoints: Bool = false
    @State private var hidePendingDeletions: Bool = false
    @State private var hideSilhouette: Bool = false
    // M5.6 — numeric calibrate panel state. Lazily synced from the renderer
    // when the user expands the panel; deltas push back via setTransform.
    @State private var numericExpanded: Bool = false
    @State private var numericTx: Double = 0
    @State private var numericTy: Double = 0
    @State private var numericTz: Double = 0
    @State private var numericScale: Double = 100  // percent
    @State private var numericYaw: Double = 0      // degrees
    // M5.1 undo/redo depth surfaces. Re-read on every commit via
    // `refreshHistoryDepth()` so disabled-state on the buttons is correct.
    @State private var undoDepth: Int = 0
    @State private var redoDepth: Int = 0
    // M5.2 — periodically-refreshed snapshots of the pending edits, used
    // by the per-item delete panel. Cheap because the panel is small.
    @State private var pendingPanelExpanded: Bool = false
    @State private var panelWaypoints: [SplatImmersiveRenderer.PendingWaypoint] = []
    @State private var panelSpheres: [DeletionSphere] = []
    @State private var panelBoxes: [DeletionBox] = []
    @State private var panelLassos: [DeletionLasso] = []
    @State private var panelYawUpdates: [(UUID, Float)] = []
    // M5.3 — autosave + resume-draft state
    @State private var pendingResumeDraft: EditorDraft? = nil
    @State private var showResumePrompt: Bool = false
    @State private var showCancelConfirm: Bool = false
    // M5.20 — first-run onboarding overlay. Persisted via UserDefaults so
    // it shows once per user and never returns unless they reset state.
    @AppStorage("splatEditor.onboardingShown_v1") private var onboardingShown: Bool = false
    @State private var showOnboarding: Bool = false
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
            // M5.20 — show onboarding overlay first time the user enters the editor.
            if !onboardingShown {
                showOnboarding = true
            }
            // M5.3 — surface any local autosaved draft for this scene.
            if let draft = EditorDraftStore.load(sceneId: currentScene.id) {
                pendingResumeDraft = draft
                showResumePrompt = true
            }
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
        let startingViewToPersist = pendingStartingView
        if currentScene.sceneEdits == nil, !didCalibrate, startingViewToPersist == nil {
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

                if let starting = startingViewToPersist {
                    struct StartingViewUpdate: Encodable { let default_camera_position: CameraPosition }
                    let updated: Scene = try await AppSupabase.client
                        .from("scenes")
                        .update(StartingViewUpdate(default_camera_position: starting))
                        .eq("id", value: currentScene.id.uuidString)
                        .select()
                        .single()
                        .execute()
                        .value
                    await MainActor.run {
                        currentScene = updated
                        pendingStartingView = nil
                    }
                }

                renderer.clearWaypointEdits()
                renderer.clearPendingDeletions()
                EditorDraftStore.discard(sceneId: currentScene.id)
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

    /// M5.5 — capture current head pose in splat-local coords, queued for
    /// the next Save which persists `scenes.default_camera_position`.
    private func performUndo() {
        SplatImmersiveRenderer.currentRenderer?.undo()
        refreshHistoryDepth()
    }

    private func performRedo() {
        SplatImmersiveRenderer.currentRenderer?.redo()
        refreshHistoryDepth()
    }

    private func autosaveDraft() {
        guard let r = SplatImmersiveRenderer.currentRenderer else { return }
        let draft = r.snapshotDraft(sceneId: currentScene.id, startingView: pendingStartingView)
        EditorDraftStore.save(draft)
    }

    private func resumeFromDraft() {
        guard let draft = pendingResumeDraft else { return }
        SplatImmersiveRenderer.currentRenderer?.applyDraft(draft)
        if let starting = draft.startingView { pendingStartingView = starting }
        pendingResumeDraft = nil
        showResumePrompt = false
    }

    private func discardDraft() {
        EditorDraftStore.discard(sceneId: currentScene.id)
        pendingResumeDraft = nil
        showResumePrompt = false
    }

    private func cancelEditWithGuard() {
        // If anything pending — drafts on disk OR in-memory state — confirm.
        let hasPending = EditorDraftStore.hasDraft(sceneId: currentScene.id)
            || (panelWaypoints.count + panelSpheres.count + panelBoxes.count
                + panelLassos.count + panelYawUpdates.count) > 0
        if hasPending {
            showCancelConfirm = true
        } else {
            exitImmersive()
        }
    }

    private func refreshPanelSnapshots() {
        guard let r = SplatImmersiveRenderer.currentRenderer else {
            panelWaypoints = []; panelSpheres = []; panelBoxes = []; panelLassos = []; panelYawUpdates = []
            return
        }
        let edits = r.snapshotWaypointEdits()
        panelWaypoints = edits.pending
        panelYawUpdates = edits.yawUpdates.map { ($0.key, $0.value) }
        panelSpheres = r.snapshotPendingDeletions()
        panelBoxes = r.snapshotPendingBoxes()
        panelLassos = r.snapshotPendingLassos()
    }

    private func refreshHistoryDepth() {
        let depth = SplatImmersiveRenderer.currentRenderer?.historyDepth() ?? (undo: 0, redo: 0)
        undoDepth = depth.undo
        redoDepth = depth.redo
    }

    private func syncNumericFromRenderer() {
        guard let t = SplatImmersiveRenderer.currentRenderer?.snapshotTransform() else { return }
        numericTx = t.translation.x * 100
        numericTy = t.translation.y * 100
        numericTz = t.translation.z * 100
        numericScale = t.scale * 100
        // Extract yaw (rotation around Y) from quaternion
        let y = t.rotation.y, w = t.rotation.w
        numericYaw = Double(atan2(2 * y * w, 1 - 2 * y * y) * 180.0 / .pi)
    }

    private func pushNumericTransform() {
        let yawRad = numericYaw * .pi / 180.0
        let halfYaw = yawRad / 2.0
        let q = Quaternion(x: 0, y: sin(halfYaw), z: 0, w: cos(halfYaw))
        let t = SceneTransform(
            scale: max(0.01, numericScale / 100.0),
            rotation: q,
            translation: Position3D(x: numericTx / 100.0, y: numericTy / 100.0, z: numericTz / 100.0)
        )
        SplatImmersiveRenderer.currentRenderer?.applyTransform(t)
    }

    private func pushDisplayFlags() {
        SplatImmersiveRenderer.currentRenderer?.setDisplayFlags(
            hideWaypoints: hideWaypoints,
            hidePendingDeletions: hidePendingDeletions,
            hideSilhouette: hideSilhouette
        )
    }

    private func captureStartingView() {
        guard let pose = SplatImmersiveRenderer.currentRenderer?.snapshotHeadPoseInSplatLocal() else {
            saveError = "No frame yet — wait for the splat to render once."
            return
        }
        saveError = nil
        pendingStartingView = pose
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
                    .task(id: isEditingMode) {
                        // Poll history depth at 4 Hz so the undo/redo button
                        // disabled-state reflects gesture commits made on the
                        // render thread.
                        var ticks = 0
                        while !Task.isCancelled, isEditingMode {
                            refreshHistoryDepth()
                            if pendingPanelExpanded { refreshPanelSnapshots() }
                            // Autosave every 20 ticks (~5 s).
                            if ticks % 20 == 0 { autosaveDraft() }
                            ticks += 1
                            try? await Task.sleep(nanoseconds: 250_000_000)
                        }
                    }
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
                .keyboardShortcut(.space, modifiers: [])
                .accessibilityHint("Triggers a synthetic pinch in the simulator")
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
    private var numericCalibratePanel: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                if !numericExpanded { syncNumericFromRenderer() }
                withAnimation(.easeOut(duration: 0.2)) { numericExpanded.toggle() }
            } label: {
                Label(numericExpanded ? "Hide numeric calibrate" : "Numeric calibrate",
                      systemImage: numericExpanded ? "chevron.up" : "ruler.fill")
                    .font(.caption)
            }
            .buttonStyle(.borderless)
            if numericExpanded {
                Group {
                    numericRow(label: "X (cm)", value: $numericTx, range: -500...500, step: 1)
                    numericRow(label: "Y (cm)", value: $numericTy, range: -500...500, step: 1)
                    numericRow(label: "Z (cm)", value: $numericTz, range: -500...500, step: 1)
                    numericRow(label: "Scale (%)", value: $numericScale, range: 1...500, step: 1)
                    numericRow(label: "Yaw (°)", value: $numericYaw, range: -180...180, step: 1)
                }
            }
        }
        .frame(maxWidth: 360, alignment: .leading)
    }

    @ViewBuilder
    private func numericRow(label: String, value: Binding<Double>, range: ClosedRange<Double>, step: Double) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(width: 80, alignment: .leading)
            Stepper(value: value, in: range, step: step) {
                Text(String(format: "%.0f", value.wrappedValue))
                    .monospacedDigit()
            }
            .onChange(of: value.wrappedValue) { _, _ in pushNumericTransform() }
        }
    }

    @ViewBuilder
    private var onboardingSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Splat editor — first run")
                .font(.title2)
                .fontWeight(.bold)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 10) {
                onboardingRow(icon: "ruler", title: "Calibrate",
                              detail: "Match the human silhouette: two-hand pinch+spread to scale, two-hand twist to rotate, one-hand pinch+drag to move.")
                onboardingRow(icon: "mappin.and.ellipse", title: "Waypoint",
                              detail: "Aim and pinch to drop a waypoint. Pinch a placed one to set arrival yaw.")
                onboardingRow(icon: "paintbrush.pointed", title: "Brush / Box / Lasso",
                              detail: "Pick a tool to mark splat regions for deletion. Save commits the removals.")
                onboardingRow(icon: "arrow.uturn.backward", title: "Undo / Redo",
                              detail: "Cmd-Z reverts the last commit; the pending-edits panel lets you remove specific items.")
                onboardingRow(icon: "scope", title: "Starting view",
                              detail: "While viewing, tap “Set starting view” to record the current head pose for new visitors.")
            }
            Button {
                onboardingShown = true
                showOnboarding = false
            } label: {
                Text("Got it")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityLabel("Dismiss onboarding")
        }
        .padding(28)
        .frame(maxWidth: 560)
    }

    @ViewBuilder
    private func onboardingRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.callout).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var pendingEditsPanel: some View {
        VStack(alignment: .leading, spacing: 6) {
            let total = panelWaypoints.count + panelSpheres.count
                + panelBoxes.count + panelLassos.count + panelYawUpdates.count
            Button {
                if !pendingPanelExpanded { refreshPanelSnapshots() }
                withAnimation(.easeOut(duration: 0.2)) { pendingPanelExpanded.toggle() }
            } label: {
                Label(pendingPanelExpanded ? "Hide pending edits (\(total))" : "Pending edits (\(total))",
                      systemImage: pendingPanelExpanded ? "chevron.up" : "list.bullet")
                    .font(.caption)
            }
            .buttonStyle(.borderless)
            if pendingPanelExpanded {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(panelWaypoints.enumerated()), id: \.element.id) { idx, wp in
                            pendingRow(label: "Waypoint @ (\(fmt(wp.localPosition.x)), \(fmt(wp.localPosition.y)), \(fmt(wp.localPosition.z)))") {
                                SplatImmersiveRenderer.currentRenderer?.removePendingWaypoint(at: idx)
                                refreshPanelSnapshots()
                                refreshHistoryDepth()
                            }
                        }
                        ForEach(Array(panelYawUpdates.enumerated()), id: \.offset) { _, pair in
                            pendingRow(label: "Yaw update on existing waypoint (\(Int(pair.1 * 180.0 / .pi))°)") {
                                SplatImmersiveRenderer.currentRenderer?.removeYawUpdate(forWaypointId: pair.0)
                                refreshPanelSnapshots()
                                refreshHistoryDepth()
                            }
                        }
                        ForEach(Array(panelSpheres.enumerated()), id: \.offset) { idx, sph in
                            pendingRow(label: "Brush sphere r=\(fmt(Float(sph.radius))) m") {
                                SplatImmersiveRenderer.currentRenderer?.removePendingDeletionSphere(at: idx)
                                refreshPanelSnapshots()
                                refreshHistoryDepth()
                            }
                        }
                        ForEach(Array(panelBoxes.enumerated()), id: \.offset) { idx, box in
                            let dx = Float(box.max[0] - box.min[0])
                            let dy = Float(box.max[1] - box.min[1])
                            let dz = Float(box.max[2] - box.min[2])
                            pendingRow(label: "Box \(fmt(dx))×\(fmt(dy))×\(fmt(dz)) m") {
                                SplatImmersiveRenderer.currentRenderer?.removePendingDeletionBox(at: idx)
                                refreshPanelSnapshots()
                                refreshHistoryDepth()
                            }
                        }
                        ForEach(Array(panelLassos.enumerated()), id: \.offset) { idx, lasso in
                            pendingRow(label: "Lasso (\(lasso.polygon.count) pts)") {
                                SplatImmersiveRenderer.currentRenderer?.removePendingDeletionLasso(at: idx)
                                refreshPanelSnapshots()
                                refreshHistoryDepth()
                            }
                        }
                        if total == 0 {
                            Text("Nothing pending")
                                .font(.callout)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                .frame(maxHeight: 180)
            }
        }
        .frame(maxWidth: 360, alignment: .leading)
    }

    @ViewBuilder
    private func pendingRow(label: String, onDelete: @escaping () -> Void) -> some View {
        HStack {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
            .controlSize(.small)
        }
    }

    private func fmt(_ v: Float) -> String { String(format: "%.2f", v) }
    private func fmt(_ v: Double) -> String { String(format: "%.2f", v) }

    @ViewBuilder
    private var displayHUD: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { hudExpanded.toggle() }
            } label: {
                Label(hudExpanded ? "Hide display options" : "Display options",
                      systemImage: hudExpanded ? "chevron.up" : "slider.horizontal.3")
                    .font(.caption)
            }
            .buttonStyle(.borderless)
            if hudExpanded {
                Toggle("Hide waypoints", isOn: $hideWaypoints)
                    .onChange(of: hideWaypoints) { _, _ in pushDisplayFlags() }
                Toggle("Hide pending deletions", isOn: $hidePendingDeletions)
                    .onChange(of: hidePendingDeletions) { _, _ in pushDisplayFlags() }
                Toggle("Hide calibration silhouette", isOn: $hideSilhouette)
                    .onChange(of: hideSilhouette) { _, _ in pushDisplayFlags() }
            }
        }
        .font(.callout)
        .frame(maxWidth: 360, alignment: .leading)
    }

    @ViewBuilder
    private var editingControls: some View {
        VStack(spacing: 16) {
            pendingEditsPanel
            displayHUD

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

            // M5.6 — numeric calibrate panel
            if activeTool == .calibrate {
                numericCalibratePanel
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

            // View-mode starting-view capture
            if activeTool == .view {
                HStack(spacing: 12) {
                    Button {
                        captureStartingView()
                    } label: {
                        Label(pendingStartingView == nil ? "Set starting view" : "Re-capture starting view",
                              systemImage: "scope")
                            .font(.callout)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.regular)
                    .disabled(isSaving)
                    if pendingStartingView != nil {
                        Label("Captured — Save to persist", systemImage: "checkmark.circle.fill")
                            .font(.callout)
                            .foregroundStyle(.green)
                    }
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

                Button {
                    performUndo()
                } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward")
                        .font(.title3)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isSaving || undoDepth == 0)
                .keyboardShortcut("z", modifiers: .command)

                Button {
                    performRedo()
                } label: {
                    Label("Redo", systemImage: "arrow.uturn.forward")
                        .font(.title3)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isSaving || redoDepth == 0)
                .keyboardShortcut("z", modifiers: [.command, .shift])

                Button(role: .cancel) {
                    cancelEditWithGuard()
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
            .confirmationDialog(
                "Discard pending edits?",
                isPresented: $showCancelConfirm,
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) {
                    EditorDraftStore.discard(sceneId: currentScene.id)
                    SplatImmersiveRenderer.currentRenderer?.clearWaypointEdits()
                    SplatImmersiveRenderer.currentRenderer?.clearPendingDeletions()
                    pendingStartingView = nil
                    exitImmersive()
                }
                Button("Keep editing", role: .cancel) { }
            } message: {
                Text("Closing now drops all unsaved waypoints, deletions, and starting-view captures.")
            }
            .alert("Resume previous draft?", isPresented: $showResumePrompt) {
                Button("Resume") { resumeFromDraft() }
                Button("Discard", role: .destructive) { discardDraft() }
            } message: {
                if let d = pendingResumeDraft {
                    Text("Found an autosaved draft from \(d.savedAt.formatted(date: .abbreviated, time: .shortened)). Resume to keep its pending edits, or discard to start fresh.")
                }
            }
            .sheet(isPresented: $showOnboarding) {
                onboardingSheet
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
