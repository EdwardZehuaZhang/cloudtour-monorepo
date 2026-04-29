import CompositorServices
import SwiftUI

@main
struct CloudTourVisionApp: App {
    @State private var authViewModel = AuthViewModel()
    @State private var immersionStyle: ImmersionStyle = .full

    var body: some SwiftUI.Scene {
        WindowGroup {
            AppShell(authViewModel: authViewModel)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }

        // M7.4 — floor plan editor opens in its own window so the user
        // can keep the tour editor open alongside.
        WindowGroup(id: "floor-plan", for: Tour.self) { $tour in
            if let tour {
                NavigationStack {
                    FloorPlanEditorView(tour: tour)
                }
            }
        }
        .defaultSize(width: 960, height: 720)

        ImmersiveSpace(for: SplatSession.self) { session in
            CompositorLayer(configuration: SplatImmersiveConfiguration()) { layerRenderer in
                if let session = session.wrappedValue {
                    SplatImmersiveRenderer.startRendering(layerRenderer, session: session)
                }
            }
        }
        .immersionStyle(selection: $immersionStyle, in: .full)

        ImmersiveSpace(for: PanoramaSession.self) { session in
            if let session = session.wrappedValue {
                PanoramaImmersiveView(session: session)
            }
        }
        .immersionStyle(selection: $immersionStyle, in: .full)
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "cloudtourvision",
              url.host == "invite",
              let token = url.pathComponents.dropFirst().first else {
            return
        }
        _ = token
    }
}
