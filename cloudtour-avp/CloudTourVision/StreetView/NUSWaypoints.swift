import CoreLocation
import Foundation

struct NUSWaypoint: Identifiable, Hashable {
    let id: String
    let name: String
    let coordinate: CLLocationCoordinate2D

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id
    }
}

enum NUSWaypoints {
    /// Curated NUS Kent Ridge waypoints. All verified with Street View
    /// metadata `status: OK` (radius 80m, outdoor source). Order roughly
    /// follows a north-to-south walking route starting at UTown.
    static let all: [NUSWaypoint] = [
        .init(id: "utown_green",
              name: "UTown Green",
              coordinate: .init(latitude: 1.3046, longitude: 103.7729)),
        .init(id: "town_plaza",
              name: "Town Plaza",
              coordinate: .init(latitude: 1.3041, longitude: 103.7733)),
        .init(id: "stephen_riady",
              name: "Stephen Riady Centre",
              coordinate: .init(latitude: 1.3043, longitude: 103.7723)),
        .init(id: "erc_utown",
              name: "Education Resource Centre",
              coordinate: .init(latitude: 1.3045, longitude: 103.7740)),
        .init(id: "mpsh",
              name: "MPSH",
              coordinate: .init(latitude: 1.3008, longitude: 103.7763)),
        .init(id: "engineering_ea",
              name: "Engineering (EA)",
              coordinate: .init(latitude: 1.3001, longitude: 103.7706)),
        .init(id: "yih",
              name: "Yusof Ishak House",
              coordinate: .init(latitude: 1.2997, longitude: 103.7745)),
        .init(id: "central_library",
              name: "Central Library",
              coordinate: .init(latitude: 1.2966, longitude: 103.7764)),
        .init(id: "lt13",
              name: "LT13",
              coordinate: .init(latitude: 1.2966, longitude: 103.7805)),
        .init(id: "science_s17",
              name: "Faculty of Science (S17)",
              coordinate: .init(latitude: 1.2974, longitude: 103.7791)),
        .init(id: "shaw_alumni",
              name: "Shaw Foundation Alumni House",
              coordinate: .init(latitude: 1.2955, longitude: 103.7762)),
        .init(id: "ventus",
              name: "Ventus",
              coordinate: .init(latitude: 1.2953, longitude: 103.7732)),
        .init(id: "computing_com1",
              name: "Computing (COM1)",
              coordinate: .init(latitude: 1.2949, longitude: 103.7740)),
        .init(id: "business_biz1",
              name: "Business School (BIZ1)",
              coordinate: .init(latitude: 1.2929, longitude: 103.7748)),
        .init(id: "kent_ridge_mrt",
              name: "Kent Ridge MRT",
              coordinate: .init(latitude: 1.2935, longitude: 103.7843))
    ]

    static let `default`: NUSWaypoint = all[0]

    /// Centroid + span large enough to fit every waypoint with margin.
    static let region: (center: CLLocationCoordinate2D, latSpan: Double, lngSpan: Double) = {
        let lats = all.map(\.coordinate.latitude)
        let lngs = all.map(\.coordinate.longitude)
        let latMid = (lats.max()! + lats.min()!) / 2
        let lngMid = (lngs.max()! + lngs.min()!) / 2
        let latSpan = (lats.max()! - lats.min()!) * 1.4
        let lngSpan = (lngs.max()! - lngs.min()!) * 1.4
        return (
            CLLocationCoordinate2D(latitude: latMid, longitude: lngMid),
            max(latSpan, 0.005),
            max(lngSpan, 0.005)
        )
    }()
}
