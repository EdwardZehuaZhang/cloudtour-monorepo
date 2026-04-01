import SwiftUI

struct SignUpView: View {
    @Bindable var authViewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var agreedToTerms = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Text("Create Account")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                VStack(spacing: 16) {
                    TextField("Display Name", text: $displayName)
                        .textContentType(.name)

                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .autocorrectionDisabled()
                        #if os(iOS) || os(visionOS)
                        .textInputAutocapitalization(.never)
                        #endif

                    SecureField("Password", text: $password)
                        .textContentType(.newPassword)
                }
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 360)

                Toggle(isOn: $agreedToTerms) {
                    Text("I agree to the Terms of Service")
                        .font(.caption)
                }
                .frame(maxWidth: 360)

                if let error = authViewModel.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                }

                Button {
                    Task {
                        await authViewModel.signUp(email: email, password: password, displayName: displayName)
                        if authViewModel.isAuthenticated { dismiss() }
                    }
                } label: {
                    if authViewModel.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Sign Up")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: 360)
                .disabled(displayName.isEmpty || email.isEmpty || password.isEmpty || !agreedToTerms || authViewModel.isLoading)

                Spacer()
            }
            .padding()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
