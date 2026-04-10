import SwiftUI

struct DashboardView: View {
    @Bindable var viewModel: DashboardViewModel
    @State private var showCreateSheet = false
    @State private var newTourTitle = ""

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.tours.isEmpty {
                    ProgressView("Loading tours…")
                } else if viewModel.tours.isEmpty {
                    ContentUnavailableView {
                        Label("No Tours", systemImage: "map")
                    } description: {
                        Text("Create your first tour to get started.")
                    } actions: {
                        Button("Create Tour") { showCreateSheet = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Hero card for the first tour
                            if let hero = viewModel.tours.first {
                                NavigationLink {
                                    TourEditorView(tour: hero, viewModel: viewModel)
                                } label: {
                                    TourHeroCard(tour: hero)
                                }
                                .buttonStyle(.plain)
                            }

                            // 2-column grid for remaining tours
                            let remaining = Array(viewModel.tours.dropFirst())
                            LazyVGrid(columns: [
                                GridItem(.flexible(), spacing: 16),
                                GridItem(.flexible(), spacing: 16)
                            ], spacing: 16) {
                                ForEach(remaining) { tour in
                                    NavigationLink {
                                        TourEditorView(tour: tour, viewModel: viewModel)
                                    } label: {
                                        TourGridCard(tour: tour)
                                    }
                                    .buttonStyle(.plain)
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            Task { await viewModel.deleteTour(tour) }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("My Tours")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                NavigationStack {
                    Form {
                        TextField("Tour Title", text: $newTourTitle)
                    }
                    .navigationTitle("New Tour")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showCreateSheet = false
                                newTourTitle = ""
                            }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Create") {
                                Task {
                                    await viewModel.createTour(title: newTourTitle)
                                    showCreateSheet = false
                                    newTourTitle = ""
                                }
                            }
                            .disabled(newTourTitle.isEmpty)
                        }
                    }
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

struct TourHeroCard: View {
    let tour: Tour

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AsyncImage(url: tour.coverImageUrl.flatMap { URL(string: $0) }) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 12)
                    .fill(.quaternary)
                    .overlay {
                        Image(systemName: "photo")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                    }
            }
            .frame(maxWidth: .infinity, minHeight: 200, maxHeight: 200)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(tour.title)
                .font(.title2)
                .fontWeight(.semibold)

            HStack {
                StatusBadge(status: tour.status)
                Spacer()
                Label("\(tour.viewCount)", systemImage: "eye")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct TourGridCard: View {
    let tour: Tour

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            AsyncImage(url: tour.coverImageUrl.flatMap { URL(string: $0) }) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.quaternary)
                    .frame(height: 100)
            }
            .frame(maxWidth: .infinity, minHeight: 100, maxHeight: 100)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Text(tour.title)
                .font(.headline)
                .lineLimit(1)

            StatusBadge(status: tour.status)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.capitalized)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status == "published" ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
            .foregroundStyle(status == "published" ? .green : .orange)
            .clipShape(Capsule())
    }
}
