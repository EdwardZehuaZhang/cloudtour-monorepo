import CoreLocation
import Foundation
import MapKit
import Observation

struct StreetViewMapSelection: Hashable {
    let coordinate: CLLocationCoordinate2D
    let label: String?

    func hash(into hasher: inout Hasher) {
        hasher.combine(coordinate.latitude)
        hasher.combine(coordinate.longitude)
        hasher.combine(label)
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.coordinate.latitude == rhs.coordinate.latitude &&
        lhs.coordinate.longitude == rhs.coordinate.longitude &&
        lhs.label == rhs.label
    }
}

@MainActor
@Observable
final class StreetViewViewModel {
    var selection: StreetViewMapSelection?
    var activeSession: PanoramaSession?
    var errorMessage: String?
    var apiKeyError: String?

    let client: StreetViewClient?

    init() {
        if let client = StreetViewClient.shared {
            self.client = client
            self.apiKeyError = nil
        } else {
            self.client = nil
            self.apiKeyError = "Add a GOOGLE_MAPS_API_KEY to Config.xcconfig and rebuild."
        }
    }
}
