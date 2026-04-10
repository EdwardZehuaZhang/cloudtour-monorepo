import SwiftUI

struct WaypointOverlay: View {
    let waypoints: [Waypoint]
    let onSelect: (Waypoint) -> Void

    var body: some View {
        VStack {
            Spacer()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(waypoints) { waypoint in
                        Button {
                            onSelect(waypoint)
                        } label: {
                            Label(waypoint.label, systemImage: "arrow.triangle.turn.up.right.diamond")
                                .font(.callout)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(.ultraThinMaterial, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 24)
        }
    }
}
