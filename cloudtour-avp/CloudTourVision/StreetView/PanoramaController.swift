import Foundation
import Observation

@MainActor
@Observable
final class PanoramaController {
    static let shared = PanoramaController()

    /// The pano currently rendered in the immersive sphere. Mutated by the
    /// 2D control window (`StreetViewTabView`); observed by
    /// `PanoramaImmersiveView` to swap textures without reopening the
    /// immersive space.
    var currentSession: PanoramaSession?

    private init() {}

    func update(_ session: PanoramaSession) {
        currentSession = session
    }
}
