import Foundation

struct PanoramaSession: Hashable, Codable {
    let panoId: String
    let lat: Double
    let lng: Double
    let initialHeading: Double
    let title: String?

    init(panoId: String, lat: Double, lng: Double, initialHeading: Double = 0, title: String? = nil) {
        self.panoId = panoId
        self.lat = lat
        self.lng = lng
        self.initialHeading = initialHeading
        self.title = title
    }
}
