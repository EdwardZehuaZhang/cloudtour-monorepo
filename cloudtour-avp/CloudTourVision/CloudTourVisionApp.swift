import SwiftUI
import RealityKit

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

        ImmersiveSpace(for: SplatFileIdentifier.self) { $fileIdentifier in
            if let fileIdentifier {
                ImmersiveView(fileIdentifier: fileIdentifier)
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
