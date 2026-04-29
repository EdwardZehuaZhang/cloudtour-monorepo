import Foundation
import Observation
import Supabase

/// M7.6 — multi-editor presence over Supabase Realtime.
///
/// One channel per `(tour_id, scene_id)` pair. Each editor publishes its
/// own state on `start(...)` and pushes a single update on each
/// `updateAim(_:)` call. `peers` is the live list of other editors in the
/// same scene, decoded from incoming join/leave events.
@MainActor
@Observable
final class EditorPresence {
    struct Peer: Codable, Identifiable, Hashable, Sendable {
        let editorId: UUID
        let displayName: String
        let avatarUrl: String?
        var aim: Position3D?

        var id: UUID { editorId }

        enum CodingKeys: String, CodingKey {
            case editorId = "editor_id"
            case displayName = "display_name"
            case avatarUrl = "avatar_url"
            case aim = "current_aim_position"
        }
    }

    var peers: [Peer] = []

    private var channel: RealtimeChannelV2?
    private var presenceTask: Task<Void, Never>?
    private var ownState: Peer?

    /// Subscribe to a channel for the given scene and start broadcasting.
    /// `displayName` and `avatarUrl` come from the local profile.
    func start(
        tourId: UUID,
        sceneId: UUID,
        editorId: UUID,
        displayName: String,
        avatarUrl: String?
    ) async {
        // Tear down any prior subscription so a scene-switch re-keys the
        // channel cleanly.
        await stop()
        let topic = "tour:\(tourId.uuidString)/scene:\(sceneId.uuidString)"
        let ch = AppSupabase.client.realtimeV2.channel(topic)
        channel = ch
        ownState = Peer(
            editorId: editorId,
            displayName: displayName,
            avatarUrl: avatarUrl,
            aim: nil
        )
        await ch.subscribe()
        // Track our own presence after subscribe so the server has a
        // stable phx_ref to broadcast joins.
        if let me = ownState {
            try? await ch.track(me)
        }
        presenceTask = Task { [weak self] in
            for await action in ch.presenceChange() {
                guard let self else { return }
                let joined = (try? action.decodeJoins(as: Peer.self)) ?? []
                let left = (try? action.decodeLeaves(as: Peer.self)) ?? []
                await self.applyPresenceDelta(joins: joined, leaves: left)
            }
        }
    }

    /// Update our own aim position. Sends a single `track(...)` so the
    /// server forwards the state to all subscribers.
    func updateAim(_ aim: Position3D) async {
        guard var me = ownState, let ch = channel else { return }
        me.aim = aim
        ownState = me
        try? await ch.track(me)
    }

    func stop() async {
        presenceTask?.cancel()
        presenceTask = nil
        if let ch = channel {
            await ch.untrack()
            await ch.unsubscribe()
        }
        channel = nil
        ownState = nil
        peers = []
    }

    private func applyPresenceDelta(joins: [Peer], leaves: [Peer]) {
        let leftIds = Set(leaves.map(\.editorId))
        var next = peers.filter { !leftIds.contains($0.editorId) }
        // Filter ourselves out of `peers` so the renderer doesn't draw a
        // marker on top of the local user's aim.
        let selfId = ownState?.editorId
        for p in joins where p.editorId != selfId {
            if let idx = next.firstIndex(where: { $0.editorId == p.editorId }) {
                next[idx] = p
            } else {
                next.append(p)
            }
        }
        peers = next
    }
}
