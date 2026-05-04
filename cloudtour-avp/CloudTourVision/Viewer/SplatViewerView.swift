import SwiftUI
import Supabase

struct SplatViewerView: View {
    let scenes: [Scene]
    let tourOrgId: UUID
    let tourId: UUID
    /// Optional. When supplied, the bottom ornament gains a "Tour info"
    /// button that opens a popover for title / category / status edit
    /// (M7.5). When nil, the button is hidden.
    var tourDetailVM: TourDetailViewModel? = nil

    @State private var currentScene: Scene
    @State private var fileURL: URL?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var waypoints: [Waypoint] = []
    @State private var hotspots: [Hotspot] = []
    @State private var comments: [Comment] = []
    @State private var currentUserId: UUID? = nil
    // M7.7 — local mirror of pending comments + thread state. Updated each
    // panel-snapshot tick so the inspector and thread popover stay live.
    @State private var panelComments: [SplatImmersiveRenderer.PendingComment] = []
    @State private var selectedPendingCommentId: UUID? = nil
    @State private var selectedCommittedCommentId: UUID? = nil
    @State private var commentReplyDraft: String = ""
    // M7.9 — stamp tool inspector mirror.
    @State private var stampScaleJitter: Double = 0.10
    @State private var stampRotationJitterDeg: Double = 15
    @State private var stampBlendCap: Double = 1.0
    @State private var stampBrushSummary: (count: Int, extent: SIMD3<Float>)? = nil
    @State private var stampUndoDepth: Int = 0
    @State private var stampRedoDepth: Int = 0
    // M7.6 — Realtime presence + scene_edits conflict.
    @State private var presence = EditorPresence()
    @State private var profileDisplayName: String = ""
    @State private var profileAvatarUrl: String? = nil
    @State private var conflictPending: Bool = false
    @State private var conflictServerVersion: Int = 0
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
    // M6.6 — perf counters HUD. Off by default; sampled at 4 Hz alongside
    // the existing history-depth poll while the editor is open.
    // M7.13 — bottom ornament reticle visibility toggle
    @State private var hideReticle: Bool = false
    // M7.2 — runtime render-uniform multipliers, plumbed to MetalSplatter
    // 1.0.1-cloudtour.2 fork's opacityMultiplier / pointSizeMultiplier.
    @State private var splatOpacity: Double = 1.0
    @State private var splatPointSize: Double = 1.0
    @State private var showPerfCounters: Bool = false
    @State private var perfFps: Double = 0
    @State private var perfMarkers: Int = 0
    @State private var perfDrawables: Int = 0
    @State private var perfSplatPoints: Int = 0
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
    // M6.1 — hotspot inspector mirror. Updated each panel-snapshot tick so
    // SwiftUI text fields stay in sync with renderer state (selected via
    // aim+pinch in-immersive).
    @State private var panelHotspots: [SplatImmersiveRenderer.PendingHotspot] = []
    @State private var selectedHotspotId: UUID? = nil
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

    init(
        scene: Scene,
        scenes: [Scene] = [],
        tourOrgId: UUID,
        tourId: UUID,
        tourDetailVM: TourDetailViewModel? = nil
    ) {
        self.tourOrgId = tourOrgId
        self.tourId = tourId
        self.scenes = scenes.isEmpty ? [scene] : scenes
        self.tourDetailVM = tourDetailVM
        self._currentScene = State(initialValue: scene)
    }

    // M7.5 — popover state. Title text + selected category + status are
    // local copies that flush via TourDetailViewModel.updateMetadata.
    @State private var showMetadataPopover: Bool = false
    @State private var metadataTitleDraft: String = ""
    @State private var metadataCategoryDraft: String = ""
    @State private var metadataStatusDraft: String = "draft"
    @State private var metadataIsSaving: Bool = false

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
        .ornament(
            visibility: isImmersiveOpen ? .visible : .hidden,
            attachmentAnchor: .scene(.bottom),
            contentAlignment: .top
        ) {
            immersiveBottomOrnament
        }
        .ornament(
            visibility: (isImmersiveOpen && scenes.count > 1) ? .visible : .hidden,
            attachmentAnchor: .scene(.leading),
            contentAlignment: .trailing
        ) {
            sceneJumperOrnament
        }
        .task(id: currentScene.id) {
            isLoading = true
            fileURL = nil
            await loadSplatFile()
            await loadWaypoints()
            await loadHotspots()
            await loadComments()
            await loadCurrentUser()
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
        let hotspotMarkers = hotspots.map(HotspotMarker.init(from:))
        let commentMarkers = comments.map(CommentMarker.init(from:))
        let session = SplatSession(
            url: url,
            sceneId: currentScene.id,
            tourId: tourId,
            orgId: tourOrgId,
            editMode: isEditingMode,
            sceneEdits: currentScene.sceneEdits,
            waypoints: markers,
            hotspots: hotspotMarkers,
            comments: commentMarkers
        )
        Task {
            let result = await openImmersiveSpace(value: session)
            if case .error = result {
                loadState.set(.failed("Could not open immersive space."))
                return
            }
            // M7.6 — start the per-scene presence channel after the
            // immersive space opens. Stops cleanly on exitImmersive().
            if let me = currentUserId {
                await presence.start(
                    tourId: tourId,
                    sceneId: currentScene.id,
                    editorId: me,
                    displayName: profileDisplayName.isEmpty
                        ? me.uuidString.prefix(8).description
                        : profileDisplayName,
                    avatarUrl: profileAvatarUrl
                )
            }
        }
    }

    private func exitImmersive() {
        Task {
            await presence.stop()
            await dismissImmersiveSpace()
            isImmersiveOpen = false
            isEditingMode = false
            loadState.set(.idle)
        }
    }

    // M7.13 — bottom ornament: reticle toggle + exit, attached to the
    // viewer window so it stays reachable in the user's ergonomic zone
    // while the splat fills the immersive space.
    // M7.5 adds a "Tour info" button that opens a popover for inline
    // metadata edit when a TourDetailViewModel is bound.
    private var immersiveBottomOrnament: some View {
        HStack(spacing: 12) {
            Toggle(isOn: Binding(
                get: { !hideReticle },
                set: { hideReticle = !$0; pushDisplayFlags() }
            )) {
                Label("Reticle", systemImage: "scope")
            }
            .toggleStyle(.button)
            .accessibilityLabel("Show aim reticle")
            .accessibilityHint("Toggle the on-screen aim dot")

            if tourDetailVM != nil {
                Divider()
                    .frame(height: 24)

                Button {
                    primeMetadataDraft()
                    showMetadataPopover = true
                } label: {
                    Label("Tour info", systemImage: "info.circle")
                }
                .popover(isPresented: $showMetadataPopover, arrowEdge: .top) {
                    metadataPopover
                }
                .accessibilityLabel("Edit tour info")
                .accessibilityHint("Title, category, and status")
            }

            Divider()
                .frame(height: 24)

            Button(role: .destructive) {
                exitImmersive()
            } label: {
                Label("Exit", systemImage: "xmark.circle.fill")
            }
            .accessibilityLabel("Exit immersive")
            .accessibilityHint("Close the immersive splat view")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassBackgroundEffect()
    }

    private func primeMetadataDraft() {
        guard let tour = tourDetailVM?.tour else { return }
        metadataTitleDraft = tour.title
        metadataCategoryDraft = tour.category ?? ""
        metadataStatusDraft = tour.status
    }

    @ViewBuilder
    private var metadataPopover: some View {
        Form {
            Section("Title") {
                TextField("Tour title", text: $metadataTitleDraft)
            }
            Section("Category") {
                TextField("e.g. Architecture, Real estate", text: $metadataCategoryDraft)
            }
            Section("Status") {
                Picker("Status", selection: $metadataStatusDraft) {
                    Text("Draft").tag("draft")
                    Text("Published").tag("published")
                    Text("Archived").tag("archived")
                }
                .pickerStyle(.segmented)
            }
            if let err = tourDetailVM?.metadataError {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
            Section {
                HStack {
                    Button("Cancel") {
                        showMetadataPopover = false
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                    Button {
                        Task { await commitMetadataDraft() }
                    } label: {
                        if metadataIsSaving {
                            ProgressView()
                        } else {
                            Text("Save")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(metadataIsSaving || metadataTitleDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .frame(minWidth: 360, minHeight: 320)
    }

    private func commitMetadataDraft() async {
        guard let vm = tourDetailVM else { return }
        metadataIsSaving = true
        let title = metadataTitleDraft.trimmingCharacters(in: .whitespaces)
        let category = metadataCategoryDraft.trimmingCharacters(in: .whitespaces)
        await vm.updateMetadata(title: title, category: category, status: metadataStatusDraft)
        metadataIsSaving = false
        if vm.metadataError == nil {
            showMetadataPopover = false
        }
    }

    // M7.13 — leading ornament: scene jumper. Tap a scene to switch
    // currentScene; the .task(id:) reloads the splat for the new scene.
    private var sceneJumperOrnament: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Scenes")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.top, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(scenes) { scene in
                        Button {
                            jumpToScene(scene)
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: scene.id == currentScene.id ? "circle.fill" : "circle")
                                    .foregroundStyle(scene.id == currentScene.id ? Color.accentColor : Color.secondary)
                                Text(scene.title)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .contentShape(.hoverEffect, RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .hoverEffect(.highlight)
                        .accessibilityLabel("Jump to scene \(scene.title)")
                    }
                }
                .padding(.bottom, 8)
            }
        }
        .frame(width: 220)
        .frame(maxHeight: 360)
        .glassBackgroundEffect()
    }

    private func jumpToScene(_ scene: Scene) {
        guard scene.id != currentScene.id else { return }
        currentScene = scene
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
        let pendingHotspots = renderer.snapshotPendingHotspots()
        let pendingCommentsSnap = renderer.snapshotPendingComments()
        let needsSceneEditsSave = didCalibrate
            || currentScene.sceneEdits == nil
            || !pendingDeletions.isEmpty
        let oldVersion = currentScene.sceneEdits?.version ?? 0

        isSaving = true
        saveError = nil

        Task {
            do {
                if needsSceneEditsSave {
                    // M7.6 — optimistic-lock check: if another editor saved
                    // between our open and our save, the server-side version
                    // will already be > oldVersion. Surface the conflict and
                    // abort the save instead of silently overwriting.
                    struct VersionRow: Decodable { let scene_edits: SceneEdits? }
                    let cur: VersionRow = try await AppSupabase.client
                        .from("scenes")
                        .select("scene_edits")
                        .eq("id", value: currentScene.id.uuidString)
                        .single()
                        .execute()
                        .value
                    let serverVersion = cur.scene_edits?.version ?? 0
                    if serverVersion != oldVersion {
                        await MainActor.run {
                            conflictServerVersion = serverVersion
                            conflictPending = true
                            saveError = "Another editor saved version \(serverVersion). Reload latest before saving again."
                            isSaving = false
                        }
                        return
                    }
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

                if !pendingHotspots.isEmpty {
                    for hs in pendingHotspots {
                        struct HotspotInsert: Encodable {
                            let scene_id: String
                            let title: String
                            let content_type: String
                            let content_markdown: String?
                            let media_url: String?
                            let position_3d: Position3D
                        }
                        let pos = Position3D(
                            x: Double(hs.localPosition.x),
                            y: Double(hs.localPosition.y),
                            z: Double(hs.localPosition.z)
                        )
                        let row = HotspotInsert(
                            scene_id: currentScene.id.uuidString,
                            title: hs.title.isEmpty ? "Hotspot" : hs.title,
                            content_type: hs.contentType.rawValue,
                            content_markdown: hs.contentMarkdown,
                            media_url: hs.mediaUrl,
                            position_3d: pos
                        )
                        try await AppSupabase.client
                            .from("hotspots")
                            .insert(row)
                            .execute()
                    }
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

                if !pendingCommentsSnap.isEmpty {
                    for c in pendingCommentsSnap {
                        let trimmed = c.body.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { continue }
                        struct CommentInsert: Encodable {
                            let scene_id: String
                            let body: String
                            let position_3d: Position3D
                            let parent_id: String?
                        }
                        let row = CommentInsert(
                            scene_id: currentScene.id.uuidString,
                            body: trimmed,
                            position_3d: Position3D(
                                x: Double(c.localPosition.x),
                                y: Double(c.localPosition.y),
                                z: Double(c.localPosition.z)
                            ),
                            parent_id: nil
                        )
                        try await AppSupabase.client.from("comments").insert(row).execute()
                    }
                }

                renderer.clearWaypointEdits()
                renderer.clearPendingDeletions()
                renderer.clearHotspotEdits()
                renderer.clearCommentEdits()
                EditorDraftStore.discard(sceneId: currentScene.id)
                await loadWaypoints()
                await loadHotspots()
                await loadComments()
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
                + panelLassos.count + panelYawUpdates.count + panelHotspots.count) > 0
        if hasPending {
            showCancelConfirm = true
        } else {
            exitImmersive()
        }
    }

    private func refreshPanelSnapshots() {
        guard let r = SplatImmersiveRenderer.currentRenderer else {
            panelWaypoints = []; panelSpheres = []; panelBoxes = []; panelLassos = []
            panelYawUpdates = []; panelHotspots = []; selectedHotspotId = nil
            panelComments = []; selectedPendingCommentId = nil; selectedCommittedCommentId = nil
            return
        }
        let edits = r.snapshotWaypointEdits()
        panelWaypoints = edits.pending
        panelYawUpdates = edits.yawUpdates.map { ($0.key, $0.value) }
        panelSpheres = r.snapshotPendingDeletions()
        panelBoxes = r.snapshotPendingBoxes()
        panelLassos = r.snapshotPendingLassos()
        panelHotspots = r.snapshotPendingHotspots()
        selectedHotspotId = r.snapshotSelectedHotspotId() ?? panelHotspots.last?.id
        panelComments = r.snapshotPendingComments()
        let cIds = r.snapshotSelectedCommentIds()
        selectedPendingCommentId = cIds.pending ?? panelComments.last?.id
        selectedCommittedCommentId = cIds.committed
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
            hideSilhouette: hideSilhouette,
            hideReticle: hideReticle
        )
    }

    // M7.2 — flush render-time multipliers down to the MetalSplatter
    // SplatRenderer instance owned by SplatImmersiveRenderer.
    private func pushRenderUniforms() {
        SplatImmersiveRenderer.currentRenderer?.setRenderUniforms(
            opacity: Float(splatOpacity),
            pointSize: Float(splatPointSize)
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
                            if activeTool == .stamp {
                                refreshStampPanel()
                            }
                            if pendingPanelExpanded || activeTool == .hotspot || activeTool == .comment {
                                refreshPanelSnapshots()
                            }
                            if showPerfCounters {
                                let perf = SplatImmersiveRenderer.currentRenderer?
                                    .snapshotPerfCounters() ?? (fps: 0, markers: 0, drawables: 0, splatPoints: 0)
                                perfFps = perf.fps
                                perfMarkers = perf.markers
                                perfDrawables = perf.drawables
                                perfSplatPoints = perf.splatPoints
                            }
                            // M7.6 — broadcast our aim to the channel and push
                            // the latest peer aims into the renderer. Run at
                            // 4 Hz alongside the existing poll; cheap enough
                            // to share the same loop.
                            if let pose = SplatImmersiveRenderer.currentRenderer?.snapshotHeadPoseInSplatLocal() {
                                await presence.updateAim(pose.position)
                            }
                            let peerAims: [SIMD3<Float>] = presence.peers.compactMap { p in
                                guard let a = p.aim else { return nil }
                                return SIMD3<Float>(Float(a.x), Float(a.y), Float(a.z))
                            }
                            SplatImmersiveRenderer.currentRenderer?.setPeerAims(peerAims)
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

                Button {
                    SplatImmersiveRenderer.debugTriggerBoxCommit()
                    refreshHistoryDepth()
                    if pendingPanelExpanded { refreshPanelSnapshots() }
                } label: {
                    Label("Commit Box (10 cm cube)", systemImage: "cube.transparent")
                        .font(.callout)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .keyboardShortcut("b", modifiers: [])
                .accessibilityLabel("Sim: commit synthetic box")
                .accessibilityHint("Skips dual-pinch and pushes a 10 cm cube onto pending deletions")

                Button {
                    SplatImmersiveRenderer.debugTriggerLassoCommit()
                    refreshHistoryDepth()
                    if pendingPanelExpanded { refreshPanelSnapshots() }
                } label: {
                    Label("Commit Lasso (10 cm square)", systemImage: "lasso")
                        .font(.callout)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .keyboardShortcut("l", modifiers: [])
                .accessibilityLabel("Sim: commit synthetic lasso")
                .accessibilityHint("Skips pinch+drag and pushes a 10 cm square lasso onto pending deletions")
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
            case .hotspot:
                Text("Place hotspots inside the scene")
                    .font(.headline)
                Text("• Aim where you want a hotspot, then pinch")
                Text("• Aim + pinch on a placed hotspot to cycle: text → image → link")
                Text("• Use the inspector below to fill in title + content")
            case .comment:
                Text("Annotate the scene with comments")
                    .font(.headline)
                Text("• Aim where you want a comment, then pinch to drop one")
                Text("• Aim + pinch on an existing comment to open its thread")
                Text("• Save publishes pending comments to your team")
            case .stamp:
                Text("Capture a region and stamp copies elsewhere")
                    .font(.headline)
                Text("• Dual-pinch + spread to define a capture box, release to load brush")
                Text("• Single-pinch deposits a stamp at the reticle (jitter applied)")
                Text("• Cmd-Z undoes the last stamp; in-session only — not persisted on Save")
            }
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .frame(maxWidth: 520, alignment: .leading)
        .padding(.horizontal, 24)
    }

    /// M6.3 — snap-to-floor and snap-to-grid quick actions. Both push onto
    /// the undo stack so the user can revert with ⌘Z.
    @ViewBuilder
    private var snapPanel: some View {
        HStack(spacing: 12) {
            Button {
                _ = SplatImmersiveRenderer.currentRenderer?.snapToFloor()
                refreshHistoryDepth()
                if numericExpanded { syncNumericFromRenderer() }
            } label: {
                Label("Snap to floor", systemImage: "arrow.down.to.line.compact")
                    .font(.callout)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Snap to floor")
            .accessibilityHint("Aligns the lowest splat point to the room floor")

            Button {
                _ = SplatImmersiveRenderer.currentRenderer?.snapToGrid()
                refreshHistoryDepth()
                if numericExpanded { syncNumericFromRenderer() }
            } label: {
                Label("Snap to 5 cm grid", systemImage: "square.grid.3x3")
                    .font(.callout)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Snap translation to 5 centimetre grid")
            .accessibilityHint("Rounds X, Y, and Z translation to the nearest 5 cm")
        }
        .frame(maxWidth: 520, alignment: .leading)
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

    /// M6.1 — title + content_type + markdown/url editor for the renderer's
    /// M7.7 — comment thread inspector. Two modes:
    /// 1. A pending comment is selected → text editor for body, Discard
    ///    button. Save button on the editor commits it (handled in saveAll).
    /// 2. A committed comment is selected → render the thread (root + replies),
    ///    let the author edit, let editors+ resolve / delete, and let any
    ///    member post a reply via direct Supabase call.
    @ViewBuilder
    private var commentInspectorPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Comment")
                .font(.headline)
            if let pending = panelComments.first(where: { $0.id == selectedPendingCommentId }) {
                pendingCommentEditor(pending: pending)
            } else if let committed = comments.first(where: { $0.id == selectedCommittedCommentId }) {
                committedCommentThread(root: committed)
            } else {
                Text("Aim + pinch to drop a new comment, or to open an existing one.")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: 520, alignment: .leading)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func pendingCommentEditor(pending: SplatImmersiveRenderer.PendingComment) -> some View {
        let id = pending.id
        let bodyBinding = Binding<String>(
            get: { panelComments.first(where: { $0.id == id })?.body ?? "" },
            set: { newValue in
                if let idx = panelComments.firstIndex(where: { $0.id == id }) {
                    panelComments[idx].body = newValue
                }
                SplatImmersiveRenderer.currentRenderer?.updatePendingComment(id: id, body: newValue)
            }
        )
        VStack(alignment: .leading, spacing: 6) {
            TextField("Comment body", text: bodyBinding, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Pending comment body")
            HStack {
                Text("New (unsaved) — saves on Save All")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                Button(role: .destructive) {
                    if let idx = panelComments.firstIndex(where: { $0.id == id }) {
                        SplatImmersiveRenderer.currentRenderer?.removePendingComment(at: idx)
                    }
                    refreshPanelSnapshots()
                } label: {
                    Label("Discard", systemImage: "trash")
                        .font(.callout)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Discard pending comment")
            }
        }
    }

    @ViewBuilder
    private func committedCommentThread(root: Comment) -> some View {
        let replies = comments.filter { $0.parentId == root.id }
            .sorted { $0.createdAt < $1.createdAt }
        VStack(alignment: .leading, spacing: 8) {
            commentRow(comment: root, isRoot: true)
            ForEach(replies) { reply in
                commentRow(comment: reply, isRoot: false)
                    .padding(.leading, 24)
            }
            HStack {
                TextField("Reply…", text: $commentReplyDraft, axis: .vertical)
                    .lineLimit(1...3)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task { await postReply(parent: root) }
                } label: {
                    Label("Reply", systemImage: "arrow.up.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(commentReplyDraft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    @ViewBuilder
    private func commentRow(comment: Comment, isRoot: Bool) -> some View {
        let isAuthor = (currentUserId == comment.authorId)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: isRoot ? "bubble.left.fill" : "arrow.turn.down.right")
                    .foregroundStyle(.secondary)
                Text(isAuthor ? "You" : comment.authorId.uuidString.prefix(8).description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if comment.resolved {
                    Label("Resolved", systemImage: "checkmark.seal.fill")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
                Spacer()
                if isRoot {
                    Button {
                        Task { await toggleResolved(comment) }
                    } label: {
                        Image(systemName: comment.resolved ? "circle" : "checkmark.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(comment.resolved ? "Reopen comment" : "Mark comment resolved")
                }
                if isAuthor {
                    Button(role: .destructive) {
                        Task { await deleteComment(comment) }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Delete comment")
                }
            }
            Text(comment.body)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// M7.9 — stamp tool inspector. Brush summary, jitter sliders, blend
    /// cap, and dedicated undo / redo for in-session stamp commits.
    @ViewBuilder
    private var stampInspectorPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Stamp brush")
                    .font(.headline)
                Spacer()
                if let s = stampBrushSummary {
                    Text("\(s.count) splats · \(String(format: "%.2f×%.2f×%.2f m", s.extent.x, s.extent.y, s.extent.z))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("No brush — dual-pinch a region to capture")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            HStack(spacing: 8) {
                Text("Scale jitter")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(width: 110, alignment: .leading)
                Slider(value: $stampScaleJitter, in: 0...0.5)
                    .onChange(of: stampScaleJitter) { _, _ in pushStampJitter() }
                    .accessibilityLabel("Stamp scale jitter")
                    .accessibilityValue("plus or minus \(Int(stampScaleJitter * 100)) percent")
                Text("±\(Int(stampScaleJitter * 100))%")
                    .font(.caption)
                    .monospacedDigit()
                    .frame(width: 56, alignment: .trailing)
            }
            HStack(spacing: 8) {
                Text("Rotation jitter")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(width: 110, alignment: .leading)
                Slider(value: $stampRotationJitterDeg, in: 0...45)
                    .onChange(of: stampRotationJitterDeg) { _, _ in pushStampJitter() }
                    .accessibilityLabel("Stamp in-plane rotation jitter")
                    .accessibilityValue("plus or minus \(Int(stampRotationJitterDeg)) degrees")
                Text("±\(Int(stampRotationJitterDeg))°")
                    .font(.caption)
                    .monospacedDigit()
                    .frame(width: 56, alignment: .trailing)
            }
            HStack(spacing: 8) {
                Text("Blend cap")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(width: 110, alignment: .leading)
                Slider(value: $stampBlendCap, in: 0...1)
                    .onChange(of: stampBlendCap) { _, _ in pushStampBlendCap() }
                    .accessibilityLabel("Stamp blend cap density")
                    .accessibilityValue("\(Int(stampBlendCap * 100)) percent")
                Text("\(Int(stampBlendCap * 100))%")
                    .font(.caption)
                    .monospacedDigit()
                    .frame(width: 56, alignment: .trailing)
            }

            HStack(spacing: 12) {
                Button(role: .destructive) {
                    SplatImmersiveRenderer.currentRenderer?.clearStampBrush()
                    refreshStampPanel()
                } label: {
                    Label("Clear brush", systemImage: "trash")
                        .font(.callout)
                }
                .buttonStyle(.bordered)
                .disabled(stampBrushSummary == nil)
                .accessibilityLabel("Clear stamp brush")

                Spacer()

                Button {
                    SplatImmersiveRenderer.currentRenderer?.undoStamp()
                    refreshStampPanel()
                } label: {
                    Label("Undo stamp", systemImage: "arrow.uturn.backward")
                        .font(.callout)
                }
                .buttonStyle(.bordered)
                .disabled(stampUndoDepth == 0)
                .keyboardShortcut("z", modifiers: [.command, .option])
                .accessibilityLabel("Undo last stamp")
                .accessibilityHint("Removes the most recently stamped chunk. Cmd-Option-Z.")

                Button {
                    SplatImmersiveRenderer.currentRenderer?.redoStamp()
                    refreshStampPanel()
                } label: {
                    Label("Redo stamp", systemImage: "arrow.uturn.forward")
                        .font(.callout)
                }
                .buttonStyle(.bordered)
                .disabled(stampRedoDepth == 0)
                .keyboardShortcut("z", modifiers: [.command, .option, .shift])
                .accessibilityLabel("Redo last stamp")
                .accessibilityHint("Re-applies the most recently undone stamp. Cmd-Option-Shift-Z.")
            }
        }
        .frame(maxWidth: 520, alignment: .leading)
        .padding(.horizontal, 4)
    }

    private func pushStampJitter() {
        SplatImmersiveRenderer.currentRenderer?.setStampJitter(
            scale: Float(stampScaleJitter),
            rotationDeg: Float(stampRotationJitterDeg)
        )
    }

    private func pushStampBlendCap() {
        SplatImmersiveRenderer.currentRenderer?.setStampBlendCap(Float(stampBlendCap))
    }

    private func refreshStampPanel() {
        stampBrushSummary = SplatImmersiveRenderer.currentRenderer?
            .snapshotStampBrush().map { (count: $0.splatCount, extent: $0.extent) }
        let depth = SplatImmersiveRenderer.currentRenderer?
            .snapshotStampUndoDepth() ?? (undo: 0, redo: 0)
        stampUndoDepth = depth.undo
        stampRedoDepth = depth.redo
    }

    /// `selectedPendingHotspotId`. Selection follows the most recent
    /// place / aim+pinch action; the picker below lets the user re-pick from
    /// the list without re-aiming.
    @ViewBuilder
    private var hotspotInspectorPanel: some View {
        let selected = panelHotspots.first(where: { $0.id == selectedHotspotId })
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Hotspot")
                    .font(.headline)
                Spacer()
                if !panelHotspots.isEmpty {
                    Picker("", selection: Binding(
                        get: { selectedHotspotId ?? panelHotspots.last?.id ?? UUID() },
                        set: { newId in
                            selectedHotspotId = newId
                            SplatImmersiveRenderer.currentRenderer?.selectPendingHotspot(newId)
                        }
                    )) {
                        ForEach(panelHotspots, id: \.id) { hs in
                            Text(hs.title.isEmpty ? "(untitled)" : hs.title).tag(hs.id)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                }
            }
            if let selected {
                hotspotInspectorFields(for: selected)
            } else {
                Text("Aim + pinch in-immersive to place a hotspot.")
                    .font(.callout)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: 520, alignment: .leading)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func hotspotInspectorFields(for selected: SplatImmersiveRenderer.PendingHotspot) -> some View {
        let id = selected.id
        let titleBinding = Binding<String>(
            get: { panelHotspots.first(where: { $0.id == id })?.title ?? "" },
            set: { newValue in
                if let idx = panelHotspots.firstIndex(where: { $0.id == id }) {
                    panelHotspots[idx].title = newValue
                }
                SplatImmersiveRenderer.currentRenderer?.updatePendingHotspot(id: id, title: newValue)
            }
        )
        let typeBinding = Binding<HotspotContentType>(
            get: { panelHotspots.first(where: { $0.id == id })?.contentType ?? .text },
            set: { newValue in
                if let idx = panelHotspots.firstIndex(where: { $0.id == id }) {
                    panelHotspots[idx].contentType = newValue
                }
                SplatImmersiveRenderer.currentRenderer?.updatePendingHotspot(id: id, contentType: newValue)
            }
        )
        let markdownBinding = Binding<String>(
            get: { panelHotspots.first(where: { $0.id == id })?.contentMarkdown ?? "" },
            set: { newValue in
                if let idx = panelHotspots.firstIndex(where: { $0.id == id }) {
                    panelHotspots[idx].contentMarkdown = newValue.isEmpty ? nil : newValue
                }
                SplatImmersiveRenderer.currentRenderer?.updatePendingHotspot(id: id, contentMarkdown: newValue)
            }
        )
        let mediaBinding = Binding<String>(
            get: { panelHotspots.first(where: { $0.id == id })?.mediaUrl ?? "" },
            set: { newValue in
                if let idx = panelHotspots.firstIndex(where: { $0.id == id }) {
                    panelHotspots[idx].mediaUrl = newValue.isEmpty ? nil : newValue
                }
                SplatImmersiveRenderer.currentRenderer?.updatePendingHotspot(id: id, mediaUrl: newValue)
            }
        )
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Title").font(.callout).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
                TextField("Hotspot title", text: titleBinding)
                    .textFieldStyle(.roundedBorder)
            }
            HStack {
                Text("Type").font(.callout).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
                Picker("Type", selection: typeBinding) {
                    ForEach(HotspotContentType.allCases, id: \.self) { type in
                        Text(type.rawValue.capitalized).tag(type)
                    }
                }
                .pickerStyle(.segmented)
            }
            HStack(alignment: .top) {
                Text("Markdown").font(.callout).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
                TextField("Body / caption", text: markdownBinding, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
            }
            if typeBinding.wrappedValue == .image
                || typeBinding.wrappedValue == .video
                || typeBinding.wrappedValue == .audio
                || typeBinding.wrappedValue == .link {
                HStack {
                    Text("URL").font(.callout).foregroundStyle(.secondary).frame(width: 80, alignment: .leading)
                    TextField("https://…", text: mediaBinding)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                }
            }
        }
    }

    @ViewBuilder
    private var pendingEditsPanel: some View {
        VStack(alignment: .leading, spacing: 6) {
            let total = panelWaypoints.count + panelSpheres.count
                + panelBoxes.count + panelLassos.count + panelYawUpdates.count
                + panelHotspots.count
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
                        ForEach(Array(panelHotspots.enumerated()), id: \.element.id) { idx, hs in
                            pendingRow(label: "Hotspot \(hs.contentType.rawValue): \(hs.title.isEmpty ? "(untitled)" : hs.title)") {
                                SplatImmersiveRenderer.currentRenderer?.removePendingHotspot(at: idx)
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
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Label("Opacity", systemImage: "circle.lefthalf.filled")
                        Spacer()
                        Text(String(format: "%.0f%%", splatOpacity * 100))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                        Button {
                            splatOpacity = 1.0
                            pushRenderUniforms()
                        } label: {
                            Image(systemName: "arrow.uturn.backward")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Reset opacity")
                    }
                    Slider(value: $splatOpacity, in: 0.1...1.0)
                        .onChange(of: splatOpacity) { _, _ in pushRenderUniforms() }
                        .accessibilityLabel("Splat opacity")
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Label("Point size", systemImage: "dot.circle.and.hand.point.up.left.fill")
                        Spacer()
                        Text(String(format: "%.2fx", splatPointSize))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                        Button {
                            splatPointSize = 1.0
                            pushRenderUniforms()
                        } label: {
                            Image(systemName: "arrow.uturn.backward")
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Reset point size")
                    }
                    Slider(value: $splatPointSize, in: 0.5...2.0)
                        .onChange(of: splatPointSize) { _, _ in pushRenderUniforms() }
                        .accessibilityLabel("Splat point-size multiplier")
                }
                Toggle("Show perf counters", isOn: $showPerfCounters)
                    .accessibilityHint("Overlay frames-per-second and marker count")
                if showPerfCounters {
                    HStack(spacing: 16) {
                        Text(String(format: "%.0f fps", perfFps)).monospacedDigit()
                        Text("\(perfMarkers) markers").monospacedDigit()
                        Text("\(perfDrawables) drawables").monospacedDigit()
                        Text("\(perfSplatPoints) splats").monospacedDigit()
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
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
                Label("Hotspot", systemImage: "star.bubble").tag(ToolMode.hotspot)
                Label("Comment", systemImage: "bubble.left.and.text.bubble.right").tag(ToolMode.comment)
                Label("Brush", systemImage: "paintbrush.pointed").tag(ToolMode.brush)
                Label("Box", systemImage: "cube.transparent").tag(ToolMode.box)
                Label("Lasso", systemImage: "lasso").tag(ToolMode.lasso)
                Label("Stamp", systemImage: "wand.and.stars").tag(ToolMode.stamp)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 520)
            .accessibilityLabel("Editor tool")
            .accessibilityHint("Pick which gesture is active in the immersive scene")

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
                snapPanel
            }

            // M6.1 — hotspot inspector
            if activeTool == .comment {
                commentInspectorPanel
            }
            if activeTool == .hotspot {
                hotspotInspectorPanel
            }
            if activeTool == .stamp {
                stampInspectorPanel
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
                    .accessibilityLabel("Brush radius")
                    .accessibilityValue("\(Int(brushRadius * 100)) centimetres")
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
                .accessibilityLabel("Save scene edits")
                .accessibilityHint("Persists calibrate, waypoints, hotspots, and deletions to the cloud")

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
                    .accessibilityLabel("Reset calibration")
                    .accessibilityHint("Returns the splat to its uncalibrated identity transform")
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
                .accessibilityLabel("Undo last edit")
                .accessibilityHint("Reverts the most recent commit. Cmd-Z keyboard shortcut.")

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
                .accessibilityLabel("Redo edit")
                .accessibilityHint("Re-applies the last undone edit. Cmd-Shift-Z keyboard shortcut.")

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
                .accessibilityLabel("Cancel editing session")
                .accessibilityHint("Exits the editor. Confirms before discarding unsaved edits.")
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
                    SplatImmersiveRenderer.currentRenderer?.clearHotspotEdits()
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

            // M7.6 — co-editor presence chip + conflict resolver.
            if !presence.peers.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "person.2.fill")
                        .foregroundStyle(.tint)
                    Text("\(presence.peers.count) other editor\(presence.peers.count == 1 ? "" : "s") in this scene")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(presence.peers.count) co-editors active")
            }
            if conflictPending {
                HStack(spacing: 12) {
                    Label("Conflict: server is at version \(conflictServerVersion)", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.callout)
                    Spacer()
                    Button {
                        Task { await reloadLatestScene() }
                    } label: {
                        Label("Reload latest", systemImage: "arrow.clockwise")
                            .font(.callout)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel("Reload latest scene")
                    .accessibilityHint("Re-fetches the scene so you can re-apply your edits on top of the newer server version")
                }
                .frame(maxWidth: 520)
            }
        }
    }

    /// M7.6 — re-fetch the scene row, reset the renderer's transform/edits
    /// to the server state, and clear the conflict banner. The user keeps
    /// their pending waypoint/hotspot/comment lists since those are
    /// non-conflicting operations (each is its own row in its own table).
    private func reloadLatestScene() async {
        do {
            let updated: Scene = try await AppSupabase.client
                .from("scenes")
                .select()
                .eq("id", value: currentScene.id.uuidString)
                .single()
                .execute()
                .value
            await MainActor.run {
                currentScene = updated
                conflictPending = false
                conflictServerVersion = 0
                saveError = nil
            }
            if let edits = updated.sceneEdits {
                SplatImmersiveRenderer.currentRenderer?.applyTransform(edits.transform)
            }
        } catch {
            await MainActor.run {
                saveError = "Reload failed: \(error.localizedDescription)"
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

    private func loadHotspots() async {
        do {
            hotspots = try await AppSupabase.client
                .from("hotspots")
                .select()
                .eq("scene_id", value: currentScene.id.uuidString)
                .execute()
                .value
        } catch {
            hotspots = []
        }
    }

    private func loadComments() async {
        do {
            comments = try await AppSupabase.client
                .from("comments")
                .select()
                .eq("scene_id", value: currentScene.id.uuidString)
                .order("created_at", ascending: true)
                .execute()
                .value
        } catch {
            comments = []
        }
    }

    private func loadCurrentUser() async {
        do {
            let user = try await AppSupabase.client.auth.user()
            currentUserId = user.id
            // Best-effort profile lookup for presence broadcasts; falls
            // through silently if the row hasn't been provisioned yet.
            struct ProfileRow: Decodable {
                let display_name: String?
                let avatar_url: String?
            }
            if let row: ProfileRow = try? await AppSupabase.client
                .from("profiles")
                .select("display_name, avatar_url")
                .eq("id", value: user.id.uuidString)
                .single()
                .execute()
                .value {
                profileDisplayName = row.display_name ?? ""
                profileAvatarUrl = row.avatar_url
            }
        } catch {
            currentUserId = nil
        }
    }

    /// M7.7 — post a reply to a committed comment thread. RLS gates this
    /// to org members. After insert we reload comments so the new row
    /// appears under the thread.
    private func postReply(parent: Comment) async {
        let body = commentReplyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let me = currentUserId else { return }
        do {
            struct ReplyInsert: Encodable {
                let scene_id: String
                let body: String
                let position_3d: Position3D
                let parent_id: String
                let author_id: String
            }
            let row = ReplyInsert(
                scene_id: parent.sceneId.uuidString,
                body: body,
                position_3d: parent.position3D,
                parent_id: parent.id.uuidString,
                author_id: me.uuidString
            )
            try await AppSupabase.client.from("comments").insert(row).execute()
            commentReplyDraft = ""
            await loadComments()
        } catch {
            saveError = "Reply failed: \(error.localizedDescription)"
        }
    }

    private func toggleResolved(_ comment: Comment) async {
        do {
            struct ResolvedPatch: Encodable { let resolved: Bool }
            try await AppSupabase.client.from("comments")
                .update(ResolvedPatch(resolved: !comment.resolved))
                .eq("id", value: comment.id.uuidString)
                .execute()
            await loadComments()
        } catch {
            saveError = "Resolve toggle failed: \(error.localizedDescription)"
        }
    }

    private func deleteComment(_ comment: Comment) async {
        do {
            try await AppSupabase.client.from("comments")
                .delete()
                .eq("id", value: comment.id.uuidString)
                .execute()
            if selectedCommittedCommentId == comment.id {
                SplatImmersiveRenderer.currentRenderer?.selectCommittedComment(nil)
                selectedCommittedCommentId = nil
            }
            await loadComments()
        } catch {
            saveError = "Delete failed: \(error.localizedDescription)"
        }
    }
}
