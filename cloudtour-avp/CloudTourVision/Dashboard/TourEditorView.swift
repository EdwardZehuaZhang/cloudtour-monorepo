import SwiftUI

struct TourEditorView: View {
    @State var tour: Tour
    @Bindable var viewModel: DashboardViewModel
    @State private var scenes: [Scene] = []
    @State private var isLoadingScenes = true

    var body: some View {
        Form {
            Section("Details") {
                TextField("Title", text: $tour.title)
                TextField("Description", text: Binding(
                    get: { tour.description ?? "" },
                    set: { tour.description = $0.isEmpty ? nil : $0 }
                ))
            }

            Section("Status") {
                Picker("Status", selection: $tour.status) {
                    Text("Draft").tag("draft")
                    Text("Published").tag("published")
                    Text("Archived").tag("archived")
                }
                .pickerStyle(.segmented)
            }

            Section("Scenes") {
                if isLoadingScenes {
                    ProgressView()
                } else if scenes.isEmpty {
                    Text("No scenes")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(scenes) { scene in
                        HStack {
                            Image(systemName: "cube.transparent")
                                .foregroundStyle(.tint)
                            VStack(alignment: .leading) {
                                Text(scene.name)
                                    .font(.headline)
                                if let desc = scene.description {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text("Order: \(scene.order)")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
            }

            Section {
                Button("Save Changes") {
                    Task { await viewModel.updateTour(tour) }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .navigationTitle("Edit Tour")
        .task {
            await loadScenes()
        }
    }

    private func loadScenes() async {
        do {
            scenes = try await AppSupabase.client
                .from("scenes")
                .select()
                .eq("tour_id", value: tour.id.uuidString)
                .order("order")
                .execute()
                .value
            isLoadingScenes = false
        } catch {
            isLoadingScenes = false
        }
    }
}
