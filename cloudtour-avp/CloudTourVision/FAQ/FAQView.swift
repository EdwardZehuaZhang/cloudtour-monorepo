import SwiftUI

struct FAQItem: Identifiable {
    let id = UUID()
    let question: String
    let answer: String
}

private let faqItems: [FAQItem] = [
    FAQItem(
        question: "What is a Gaussian splat?",
        answer: "Gaussian splatting is a cutting-edge 3D rendering technique that represents scenes as collections of 3D Gaussian distributions. Unlike traditional mesh-based 3D, splats capture photorealistic detail including lighting, reflections, and fine textures — making virtual tours feel like you're actually there."
    ),
    FAQItem(
        question: "What file formats do you support?",
        answer: "CloudTour supports .ply (Polygon File Format), .splat (raw Gaussian data), and .spz (compressed format). You can generate these from popular tools like Luma AI, Polycam, Nerfstudio, or any Gaussian splatting pipeline."
    ),
    FAQItem(
        question: "Can I embed tours on my website?",
        answer: "Yes! Every published tour comes with an embed code snippet you can paste into any website. The viewer is responsive and works across all modern browsers and devices."
    ),
    FAQItem(
        question: "Does it work with Apple Vision Pro?",
        answer: "Yes. CloudTour includes native WebXR support. Visitors on Apple Vision Pro can tap 'View in Apple Vision Pro' to experience your tour in spatial computing — no app download required."
    ),
    FAQItem(
        question: "Can I cancel my subscription anytime?",
        answer: "Absolutely. You can cancel your Pro or Enterprise subscription at any time from your dashboard settings. Your tours will remain accessible on the Free plan with its limits."
    ),
    FAQItem(
        question: "Is my data secure?",
        answer: "CloudTour uses Supabase with Row Level Security on every table. Your data is encrypted in transit and at rest. We comply with PDPA regulations and you can request full data deletion at any time."
    ),
]

struct FAQView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Frequently asked questions")
                        .font(.largeTitle)
                        .fontWeight(.semibold)
                    Text("Everything you need to know about CloudTour.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 0) {
                    ForEach(faqItems) { item in
                        FAQRow(item: item)
                    }
                }
            }
            .padding(40)
            .frame(maxWidth: 840, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .navigationTitle("FAQ")
    }
}

private struct FAQRow: View {
    let item: FAQItem
    @State private var isOpen = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    isOpen.toggle()
                }
            } label: {
                HStack(alignment: .center) {
                    Text(item.question)
                        .font(.headline)
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isOpen {
                Text(item.answer)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 20)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            Divider()
        }
    }
}

#Preview {
    NavigationStack {
        FAQView()
    }
}
