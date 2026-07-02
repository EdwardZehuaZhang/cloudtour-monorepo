import Foundation
import Observation

@MainActor
@Observable
final class PanoramaLoadState {
    static let shared = PanoramaLoadState()

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
