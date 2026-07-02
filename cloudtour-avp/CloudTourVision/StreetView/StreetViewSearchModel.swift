import Foundation
import MapKit
import Observation

private final class ResultsBox: @unchecked Sendable {
    let results: [MKLocalSearchCompletion]
    init(results: [MKLocalSearchCompletion]) { self.results = results }
}

@MainActor
@Observable
final class StreetViewSearchModel: NSObject, MKLocalSearchCompleterDelegate {
    var query: String = "" {
        didSet { completer.queryFragment = query }
    }
    var completions: [MKLocalSearchCompletion] = []

    private let completer: MKLocalSearchCompleter

    override init() {
        self.completer = MKLocalSearchCompleter()
        super.init()
        self.completer.resultTypes = [.address, .pointOfInterest]
        self.completer.delegate = self
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        // MKLocalSearchCompleter delegate callbacks fire on the main thread.
        let box = ResultsBox(results: completer.results)
        MainActor.assumeIsolated {
            self.completions = box.results
        }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            self.completions = []
        }
    }

    func resolve(_ completion: MKLocalSearchCompletion) async -> StreetViewMapSelection? {
        let request = MKLocalSearch.Request(completion: completion)
        let search = MKLocalSearch(request: request)
        do {
            let response = try await search.start()
            guard let item = response.mapItems.first else { return nil }
            let coord = item.location.coordinate
            let label = item.name ?? completion.title
            return StreetViewMapSelection(coordinate: coord, label: label)
        } catch {
            return nil
        }
    }

    func clear() {
        query = ""
        completions = []
    }
}
