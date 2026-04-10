import SwiftUI

struct InviteView: View {
    let token: String
    @State private var isProcessing = true
    @State private var resultMessage: String?
    @State private var isSuccess = false

    var body: some View {
        VStack(spacing: 24) {
            if isProcessing {
                ProgressView()
                    .scaleEffect(1.5)
                Text("Processing invitation…")
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(isSuccess ? .green : .red)

                Text(isSuccess ? "Welcome!" : "Invitation Error")
                    .font(.title)
                    .fontWeight(.bold)

                if let message = resultMessage {
                    Text(message)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .padding()
        .task {
            await processInvite()
        }
    }

    private func processInvite() async {
        do {
            guard let apiBase = Bundle.main.infoDictionary?["API_BASE_URL"] as? String,
                  let url = URL(string: "\(apiBase)/api/invites/accept") else {
                throw URLError(.badURL)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let session = try? await AppSupabase.client.auth.session {
                request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            }

            let body = ["token": token]
            request.httpBody = try JSONEncoder().encode(body)

            let (_, response) = try await URLSession.shared.data(for: request)
            let httpResponse = response as? HTTPURLResponse

            if let status = httpResponse?.statusCode, (200..<300).contains(status) {
                isSuccess = true
                resultMessage = "You've been added to the organization."
            } else {
                isSuccess = false
                resultMessage = "The invitation may have expired or already been used."
            }
        } catch {
            isSuccess = false
            resultMessage = error.localizedDescription
        }
        isProcessing = false
    }
}
