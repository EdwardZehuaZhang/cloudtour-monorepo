import CoreLocation
import MapKit
import SwiftUI

struct StreetViewMapView: View {
    @Bindable var viewModel: StreetViewViewModel
    let onEnter: (StreetViewMapSelection) -> Void

    @State private var search = StreetViewSearchModel()
    @State private var cameraPosition: MapCameraPosition = {
        let r = NUSWaypoints.region
        return .region(MKCoordinateRegion(
            center: r.center,
            span: MKCoordinateSpan(latitudeDelta: r.latSpan, longitudeDelta: r.lngSpan)
        ))
    }()
    @State private var showCompletions: Bool = false

    var body: some View {
        ZStack(alignment: .top) {
            mapLayer
                .ignoresSafeArea()

            searchBar
                .padding(.horizontal, 24)
                .padding(.top, 16)

            if let selection = viewModel.selection {
                bottomSheet(selection: selection)
            }
        }
    }

    private var mapLayer: some View {
        MapReader { proxy in
            Map(position: $cameraPosition) {
                ForEach(NUSWaypoints.all) { waypoint in
                    Annotation(waypoint.name, coordinate: waypoint.coordinate) {
                        Button {
                            select(waypoint: waypoint)
                        } label: {
                            Image(systemName: "binoculars.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.white, .blue)
                                .background(Circle().fill(.regularMaterial))
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let selection = viewModel.selection,
                   !NUSWaypoints.all.contains(where: { sameCoord($0.coordinate, selection.coordinate) }) {
                    Marker(selection.label ?? "Selected", coordinate: selection.coordinate)
                        .tint(.orange)
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .onTapGesture { screenPoint in
                guard let coord = proxy.convert(screenPoint, from: .local) else { return }
                viewModel.selection = StreetViewMapSelection(
                    coordinate: coord,
                    label: nil
                )
                showCompletions = false
            }
        }
    }

    private func select(waypoint: NUSWaypoint) {
        let selection = StreetViewMapSelection(
            coordinate: waypoint.coordinate,
            label: waypoint.name
        )
        viewModel.selection = selection
        showCompletions = false
        onEnter(selection)
    }

    private func sameCoord(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Bool {
        abs(a.latitude - b.latitude) < 0.00001 && abs(a.longitude - b.longitude) < 0.00001
    }

    private var searchBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search address or landmark", text: $search.query)
                    .textFieldStyle(.plain)
                    .onChange(of: search.query) { _, newValue in
                        showCompletions = !newValue.isEmpty
                    }
                if !search.query.isEmpty {
                    Button {
                        search.clear()
                        showCompletions = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))

            if showCompletions && !search.completions.isEmpty {
                completionList
                    .padding(.top, 6)
            }
        }
    }

    private var completionList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(search.completions.prefix(8), id: \.self) { completion in
                Button {
                    Task {
                        guard let selection = await search.resolve(completion) else { return }
                        viewModel.selection = selection
                        cameraPosition = .region(MKCoordinateRegion(
                            center: selection.coordinate,
                            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                        ))
                        search.clear()
                        showCompletions = false
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(completion.title).font(.body)
                        if !completion.subtitle.isEmpty {
                            Text(completion.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private func bottomSheet(selection: StreetViewMapSelection) -> some View {
        VStack {
            Spacer()
            VStack(spacing: 12) {
                if let label = selection.label {
                    Text(label).font(.headline)
                } else {
                    Text(String(format: "%.4f, %.4f",
                                selection.coordinate.latitude,
                                selection.coordinate.longitude))
                        .font(.headline)
                }
                Button {
                    onEnter(selection)
                } label: {
                    Label("Enter Street View", systemImage: "binoculars.fill")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
    }
}
