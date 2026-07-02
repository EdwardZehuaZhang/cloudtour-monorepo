import CoreLocation
import SwiftUI

struct StreetViewTabView: View {
    @State private var viewModel = StreetViewViewModel()
    @State private var isImmersiveOpen = false

    private let controller = PanoramaController.shared
    private let loadState = PanoramaLoadState.shared

    /// First curated NUS waypoint — default landing pano.
    private static var defaultCoordinate: CLLocationCoordinate2D {
        NUSWaypoints.default.coordinate
    }
    private static var defaultLabel: String {
        NUSWaypoints.default.name
    }

    @Environment(\.openImmersiveSpace) private var openImmersiveSpace
    @Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

    var body: some View {
        ZStack {
            if let apiKeyError = viewModel.apiKeyError {
                ContentUnavailableView(
                    "Street View unavailable",
                    systemImage: "binoculars",
                    description: Text(apiKeyError)
                )
            } else {
                StreetViewMapView(viewModel: viewModel) { selection in
                    Task { await shift(to: selection) }
                }

                if case .loading = loadState.phase {
                    loadingOverlay
                }

                if case .failed(let message) = loadState.phase {
                    errorOverlay(message: message)
                }
            }
        }
        .navigationTitle("Street View")
        .task {
            await initialEnter()
        }
        .onDisappear {
            Task { await exit() }
        }
    }

    private var loadingOverlay: some View {
        VStack {
            Spacer()
            HStack(spacing: 12) {
                ProgressView()
                Text("Loading panorama…").foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.regularMaterial, in: Capsule())
            .padding(.bottom, 140)
        }
        .allowsHitTesting(false)
    }

    private func errorOverlay(message: String) -> some View {
        VStack {
            Spacer()
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text(message).font(.callout)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.regularMaterial, in: Capsule())
            .padding(.bottom, 140)
        }
    }

    private func initialEnter() async {
        guard !isImmersiveOpen else { return }
        let initial = StreetViewMapSelection(
            coordinate: Self.defaultCoordinate,
            label: Self.defaultLabel
        )
        viewModel.selection = initial
        await loadAndOpen(initial)
    }

    /// First entry: fetch metadata, open immersive space (which builds the
    /// sphere via `PanoramaImmersiveView` and loads the tiles itself).
    private func loadAndOpen(_ selection: StreetViewMapSelection) async {
        loadState.set(.loading)
        do {
            guard let client = viewModel.client else { throw StreetViewError.missingAPIKey }
            let metadata = try await client.fetchMetadata(at: selection.coordinate)
            let session = PanoramaSession(
                panoId: metadata.panoId,
                lat: metadata.lat,
                lng: metadata.lng,
                initialHeading: metadata.heading,
                title: selection.label ?? metadata.location
            )
            controller.update(session)
            let result = await openImmersiveSpace(value: session)
            switch result {
            case .opened:
                isImmersiveOpen = true
            case .error, .userCancelled:
                loadState.set(.failed("Could not open immersive space."))
            @unknown default:
                loadState.set(.failed("Unknown immersive space result."))
            }
        } catch let error as StreetViewError {
            loadState.set(.failed(error.userMessage))
        } catch {
            loadState.set(.failed(error.localizedDescription))
        }
    }

    /// Subsequent shifts (search hit or map tap): keep the immersive space
    /// open and let the sphere observer swap the texture in place.
    private func shift(to selection: StreetViewMapSelection) async {
        viewModel.selection = selection
        if !isImmersiveOpen {
            await loadAndOpen(selection)
            return
        }
        loadState.set(.loading)
        do {
            guard let client = viewModel.client else { throw StreetViewError.missingAPIKey }
            let metadata = try await client.fetchMetadata(at: selection.coordinate)
            let session = PanoramaSession(
                panoId: metadata.panoId,
                lat: metadata.lat,
                lng: metadata.lng,
                initialHeading: metadata.heading,
                title: selection.label ?? metadata.location
            )
            controller.update(session)
        } catch let error as StreetViewError {
            loadState.set(.failed(error.userMessage))
        } catch {
            loadState.set(.failed(error.localizedDescription))
        }
    }

    private func exit() async {
        guard isImmersiveOpen else { return }
        await dismissImmersiveSpace()
        isImmersiveOpen = false
        loadState.set(.idle)
        controller.currentSession = nil
    }
}
