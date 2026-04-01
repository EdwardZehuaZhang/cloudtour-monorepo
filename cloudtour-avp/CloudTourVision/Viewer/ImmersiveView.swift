import SwiftUI
import RealityKit
import MetalSplatter

struct SplatFileIdentifier: Hashable, Codable {
    let url: URL
}

struct ImmersiveView: View {
    let fileIdentifier: SplatFileIdentifier
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace
    @State private var isLoaded = false

    var body: some View {
        RealityView { content in
            // MetalSplatter rendering setup
            // The actual CompositorLayer rendering is configured via the
            // ImmersiveSpace registration in the App entry point.
            // This RealityView serves as the SwiftUI container.
            let anchor = AnchorEntity(.head)
            content.add(anchor)
            isLoaded = true
        }
        .overlay(alignment: .bottom) {
            if isLoaded {
                Button {
                    Task { await dismissImmersiveSpace() }
                } label: {
                    Label("Exit Immersive", systemImage: "xmark.circle")
                        .padding()
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding(.bottom, 40)
            }
        }
    }
}
