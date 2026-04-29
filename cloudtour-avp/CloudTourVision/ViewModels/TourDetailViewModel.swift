import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class TourDetailViewModel {
    /// Mutable so M7.5 metadata quick-edit can update title / category /
    /// status optimistically. Callers reading `tour` outside this class
    /// must accept that it can change after init.
    var tour: Tour
    var scenes: [Scene] = []
    var isLoading = true
    var autoNavigateScene: Scene?
    /// Last metadata-update error (nil on success). UI surfaces this in
    /// the quick-edit panel; it is cleared by the next successful PATCH.
    var metadataError: String?
    /// Optional dashboard hook so the dashboard tour list reflects the
    /// quick-edit without a manual refetch. Set by the caller that owns
    /// both this VM and the DashboardViewModel.
    var onTourUpdated: ((Tour) -> Void)?

    init(tour: Tour) {
        self.tour = tour
    }

    func loadScenes() async {
        do {
            scenes = try await AppSupabase.client
                .from("scenes")
                .select()
                .eq("tour_id", value: tour.id.uuidString)
                .order("sort_order")
                .execute()
                .value
        } catch {
            scenes = []
        }
        isLoading = false
    }

    /// M7.5 — optimistic metadata patch. Applies the change locally first,
    /// then persists; rolls back if the PATCH fails so the panel UI does
    /// not lie about server state.
    func updateMetadata(title: String, category: String?, status: String) async {
        let snapshot = tour
        var next = tour
        next.title = title
        next.category = (category?.isEmpty == true) ? nil : category
        next.status = status
        tour = next
        metadataError = nil
        struct Patch: Encodable {
            let title: String
            let category: String?
            let status: String
        }
        do {
            try await AppSupabase.client
                .from("tours")
                .update(Patch(title: next.title, category: next.category, status: next.status))
                .eq("id", value: next.id.uuidString)
                .execute()
            onTourUpdated?(next)
        } catch {
            tour = snapshot
            metadataError = error.localizedDescription
        }
    }
}
