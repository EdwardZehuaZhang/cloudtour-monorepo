import RealityKit
import SwiftUI

struct PanoramaImmersiveView: View {
    /// The session value passed in by `ImmersiveSpace(for:)`. Acts only as
    /// the initial trigger — once the immersive view is alive, subsequent
    /// pano changes flow through `PanoramaController.shared`.
    let session: PanoramaSession

    @State private var sphere: ModelEntity?

    private let controller = PanoramaController.shared

    var body: some View {
        RealityView { content in
            let sphere = makeSphere()
            content.add(sphere)
            self.sphere = sphere
        }
        .task {
            // Drive texture loads off the controller. Reloads whenever the
            // 2D control window selects a new location.
            await reload(session: session)
            var lastPanoId = session.panoId
            while !Task.isCancelled {
                if let next = controller.currentSession, next.panoId != lastPanoId {
                    lastPanoId = next.panoId
                    await reload(session: next)
                }
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
    }

    private func makeSphere() -> ModelEntity {
        let mesh = MeshResource.generateSphere(radius: 1000)
        var material = UnlitMaterial(color: .gray)
        material.faceCulling = .none
        let entity = ModelEntity(mesh: mesh, materials: [material])
        // Flip normals inward so we view from the inside of the sphere.
        entity.scale = SIMD3(-1, 1, 1)
        entity.position = SIMD3(0, 1.6, 0)
        return entity
    }

    @MainActor
    private func applyHeading(_ heading: Double) {
        let yaw = Float(-heading) * .pi / 180
        sphere?.orientation = simd_quatf(angle: yaw, axis: SIMD3(0, 1, 0))
    }

    @MainActor
    private func reload(session: PanoramaSession) async {
        guard let client = StreetViewClient.shared else {
            PanoramaLoadState.shared.set(.failed("Missing Google Maps API key."))
            return
        }
        PanoramaLoadState.shared.set(.loading)
        applyHeading(session.initialHeading)
        do {
            let cgImage = try await client.fetchEquirectangular(panoId: session.panoId)
            let texture = try await TextureResource(
                image: cgImage,
                options: .init(semantic: .color)
            )
            var material = UnlitMaterial(color: .white)
            material.faceCulling = .none
            material.color = .init(tint: .white, texture: .init(texture))
            sphere?.model?.materials = [material]
            PanoramaLoadState.shared.set(.ready)
        } catch let error as StreetViewError {
            PanoramaLoadState.shared.set(.failed(error.userMessage))
        } catch {
            PanoramaLoadState.shared.set(.failed(error.localizedDescription))
        }
    }
}
