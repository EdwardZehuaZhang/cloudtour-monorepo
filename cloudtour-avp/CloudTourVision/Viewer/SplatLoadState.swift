import Foundation
import Observation

/// Shared load-state channel between `SplatImmersiveRenderer` (which runs
/// inside the CompositorLayer's render closure and cannot receive callbacks)
/// and `SplatViewerView` (which drives the 2D window's UI). The renderer
/// writes to `phase`; the view observes it and swaps between loading /
/// ready / failed chrome.
@MainActor
@Observable
final class SplatLoadState {
    static let shared = SplatLoadState()

    enum Phase: Equatable {
        case idle
        case loading
        case ready
        case failed(String)
    }

    var phase: Phase = .idle

    private init() {}

    func set(_ newPhase: Phase) {
        phase = newPhase
    }
}
