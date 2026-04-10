import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class TourDirectoryViewModel {
    var tours: [Tour] = []
    var isLoading = false
    var hasMore = true
    var searchText = "" {
        didSet {
            Task { await loadTours() }
        }
    }

    private let pageSize = 20
    private var currentPage = 0

    func loadTours() async {
        isLoading = true
        currentPage = 0

        do {
            var query = AppSupabase.client
                .from("tours")
                .select()
                .eq("status", value: "published")

            if !searchText.isEmpty {
                query = query.ilike("title", pattern: "%\(searchText)%")
            }

            tours = try await query
                .order("view_count", ascending: false)
                .limit(pageSize)
                .execute()
                .value
            hasMore = tours.count >= pageSize
        } catch {
            tours = []
            hasMore = false
        }
        isLoading = false
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        currentPage += 1

        do {
            var query = AppSupabase.client
                .from("tours")
                .select()
                .eq("status", value: "published")

            if !searchText.isEmpty {
                query = query.ilike("title", pattern: "%\(searchText)%")
            }

            let newTours: [Tour] = try await query
                .order("view_count", ascending: false)
                .range(from: currentPage * pageSize, to: (currentPage + 1) * pageSize - 1)
                .execute()
                .value
            tours.append(contentsOf: newTours)
            hasMore = newTours.count >= pageSize
        } catch {
            hasMore = false
        }
        isLoading = false
    }
}
