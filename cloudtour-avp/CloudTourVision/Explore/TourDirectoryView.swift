import SwiftUI

struct TourDirectoryView: View {
    @Bindable var viewModel: TourDirectoryViewModel
    @State private var selectedTour: Tour?

    var body: some View {
        NavigationStack {
            List {
                ForEach(viewModel.tours) { tour in
                    NavigationLink(value: tour) {
                        TourRowView(tour: tour)
                    }
                }

                if viewModel.hasMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .task {
                            await viewModel.loadMore()
                        }
                }
            }
            .navigationTitle("Explore")
            .searchable(text: $viewModel.searchText)
            .navigationDestination(for: Tour.self) { tour in
                TourDetailView(viewModel: TourDetailViewModel(tour: tour))
            }
            .overlay {
                if viewModel.tours.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView("No Tours Found", systemImage: "map", description: Text("Published tours will appear here."))
                }
            }
            .task {
                if viewModel.tours.isEmpty {
                    await viewModel.loadTours()
                }
            }
            .refreshable {
                await viewModel.loadTours()
            }
        }
    }
}

struct TourRowView: View {
    let tour: Tour

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: tour.coverImageUrl.flatMap { URL(string: $0) }) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.quaternary)
                    .overlay {
                        Image(systemName: "photo")
                            .foregroundStyle(.secondary)
                    }
            }
            .frame(width: 80, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(tour.title)
                    .font(.headline)

                if let description = tour.description {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let location = tour.location {
                        Label(location, systemImage: "location")
                    }
                    Label("\(tour.viewCount)", systemImage: "eye")
                }
                .font(.caption2)
                .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }
}
