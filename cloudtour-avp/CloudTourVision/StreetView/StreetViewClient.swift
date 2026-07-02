import CoreGraphics
import CoreLocation
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum StreetViewError: Error {
    case missingAPIKey
    case noCoverage
    case metadataFailed(String)
    case tileFailed(String)
    case decodeFailed

    var userMessage: String {
        switch self {
        case .missingAPIKey:
            "Add a GOOGLE_MAPS_API_KEY to Config.xcconfig and rebuild."
        case .noCoverage:
            "No Street View imagery here. Try another spot."
        case .metadataFailed(let detail):
            "Couldn't reach Street View: \(detail)"
        case .tileFailed(let detail):
            "Failed to load panorama tiles: \(detail)"
        case .decodeFailed:
            "Failed to decode panorama image."
        }
    }
}

struct StreetViewMetadata {
    let panoId: String
    let lat: Double
    let lng: Double
    let heading: Double
    let location: String?
    let copyright: String?
}

actor StreetViewClient {
    static let shared: StreetViewClient? = {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "GoogleMapsAPIKey") as? String,
              !key.isEmpty,
              !key.hasPrefix("your-") else {
            return nil
        }
        return StreetViewClient(apiKey: key)
    }()

    /// Map Tiles API zoom: at zoom z, grid is (2^z) cols × (2^max(z-1,0)) rows.
    /// z=3 → 8×4 × 512px = 4096×2048. Balance sharpness/bandwidth on visionOS.
    static let tileZoom: Int = 3
    static let tileSize: Int = 512
    static var tileCols: Int { 1 << tileZoom }
    static var tileRows: Int { 1 << max(tileZoom - 1, 0) }

    private let apiKey: String
    private let session: URLSession
    private var sessionToken: String?
    private var sessionExpiry: Date?

    init(apiKey: String) {
        self.apiKey = apiKey
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .returnCacheDataElseLoad
        config.urlCache = URLCache(memoryCapacity: 64 * 1024 * 1024,
                                    diskCapacity: 256 * 1024 * 1024)
        self.session = URLSession(configuration: config)
    }

    /// Creates or returns a cached Map Tiles session token. Required by all
    /// `tile.googleapis.com` endpoints. Tokens last up to two weeks; we refresh
    /// 5 minutes before expiry.
    private func ensureSessionToken() async throws -> String {
        if let token = sessionToken,
           let expiry = sessionExpiry,
           expiry.timeIntervalSinceNow > 300 {
            return token
        }
        guard let url = URL(string: "https://tile.googleapis.com/v1/createSession?key=\(apiKey)") else {
            throw StreetViewError.metadataFailed("bad session url")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "mapType": "streetview",
            "language": "en-US",
            "region": "US"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            let detail = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw StreetViewError.metadataFailed("createSession: \(detail)")
        }
        struct SessionResponse: Decodable {
            let session: String
            let expiry: String
        }
        let decoded = try JSONDecoder().decode(SessionResponse.self, from: data)
        let expirySeconds = TimeInterval(decoded.expiry) ?? 0
        let expiryDate: Date = expirySeconds > 0
            ? Date(timeIntervalSince1970: expirySeconds)
            : Date().addingTimeInterval(13 * 24 * 3600)
        sessionToken = decoded.session
        sessionExpiry = expiryDate
        return decoded.session
    }

    func fetchMetadata(at coordinate: CLLocationCoordinate2D) async throws -> StreetViewMetadata {
        var components = URLComponents(string: "https://maps.googleapis.com/maps/api/streetview/metadata")!
        components.queryItems = [
            .init(name: "location", value: "\(coordinate.latitude),\(coordinate.longitude)"),
            .init(name: "radius", value: "100"),
            .init(name: "source", value: "outdoor"),
            .init(name: "key", value: apiKey)
        ]
        guard let url = components.url else {
            throw StreetViewError.metadataFailed("bad url")
        }
        let (data, _) = try await session.data(from: url)
        struct Response: Decodable {
            let status: String
            let pano_id: String?
            let location: Coord?
            let copyright: String?
            struct Coord: Decodable { let lat: Double; let lng: Double }
        }
        let decoded: Response
        do {
            decoded = try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw StreetViewError.metadataFailed("decode: \(error.localizedDescription)")
        }
        guard decoded.status == "OK",
              let panoId = decoded.pano_id,
              let loc = decoded.location else {
            if decoded.status == "ZERO_RESULTS" || decoded.status == "NOT_FOUND" {
                throw StreetViewError.noCoverage
            }
            throw StreetViewError.metadataFailed(decoded.status)
        }
        return StreetViewMetadata(
            panoId: panoId,
            lat: loc.lat,
            lng: loc.lng,
            heading: 0,
            location: nil,
            copyright: decoded.copyright
        )
    }

    func fetchEquirectangular(panoId: String) async throws -> CGImage {
        let cols = Self.tileCols
        let rows = Self.tileRows
        let tileSize = Self.tileSize
        let zoom = Self.tileZoom
        let token = try await ensureSessionToken()

        let tiles = try await withThrowingTaskGroup(of: (Int, Int, Data).self) { group -> [[Data]] in
            for y in 0..<rows {
                for x in 0..<cols {
                    group.addTask { [apiKey, session] in
                        let data = try await Self.fetchTile(
                            panoId: panoId,
                            x: x,
                            y: y,
                            zoom: zoom,
                            sessionToken: token,
                            apiKey: apiKey,
                            session: session
                        )
                        return (x, y, data)
                    }
                }
            }
            var grid: [[Data]] = Array(
                repeating: Array(repeating: Data(), count: cols),
                count: rows
            )
            for try await (x, y, data) in group {
                grid[y][x] = data
            }
            return grid
        }

        return try Self.stitch(
            tileGrid: tiles,
            cols: cols,
            rows: rows,
            tileSize: tileSize
        )
    }

    private static func fetchTile(
        panoId: String,
        x: Int,
        y: Int,
        zoom: Int,
        sessionToken: String,
        apiKey: String,
        session: URLSession
    ) async throws -> Data {
        var components = URLComponents(string: "https://tile.googleapis.com/v1/streetview/tiles/\(zoom)/\(x)/\(y)")!
        components.queryItems = [
            .init(name: "session", value: sessionToken),
            .init(name: "key", value: apiKey),
            .init(name: "panoId", value: panoId)
        ]
        guard let url = components.url else {
            throw StreetViewError.tileFailed("bad tile url")
        }
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw StreetViewError.tileFailed("HTTP \(http.statusCode)")
        }
        return data
    }

    private static func stitch(
        tileGrid: [[Data]],
        cols: Int,
        rows: Int,
        tileSize: Int
    ) throws -> CGImage {
        let width = cols * tileSize
        let height = rows * tileSize
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw StreetViewError.decodeFailed
        }

        for y in 0..<rows {
            for x in 0..<cols {
                let data = tileGrid[y][x]
                guard !data.isEmpty,
                      let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let tile = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
                    continue
                }
                // CGContext origin is bottom-left, but tile (0,0) is top-left.
                let drawY = height - (y + 1) * tileSize
                let rect = CGRect(x: x * tileSize, y: drawY,
                                  width: tileSize, height: tileSize)
                context.draw(tile, in: rect)
            }
        }

        guard let image = context.makeImage() else {
            throw StreetViewError.decodeFailed
        }
        return image
    }
}
