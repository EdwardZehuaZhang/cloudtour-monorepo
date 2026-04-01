import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class TourDetailViewModel {
    let tour: Tour
    var scenes: [Scene] = []
    var isLoading = true
    var autoNavigateScene: Scene?

    init(tour: Tour) {
        self.tour = tour
    }

    func loadScenes() async {
        do {
            scenes = try await AppSupabase.client
                .from("scenes")
                .select()
                .eq("tour_id", value: tour.id.uuidString)
                .order("order")
                .execute()
                .value
        } catch {
            scenes = []
        }
        isLoading = false
    }
}
