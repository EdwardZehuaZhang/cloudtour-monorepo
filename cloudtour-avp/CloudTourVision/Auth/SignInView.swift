import SwiftUI

struct SignInView: View {
    @Bindable var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showSignUp = false
    @State private var showForgotPassword = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("CloudTour")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Sign in to your account")
                .font(.headline)
                .foregroundStyle(.secondary)

            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    #if os(iOS) || os(visionOS)
                    .textInputAutocapitalization(.never)
                    #endif

                SecureField("Password", text: $password)
                    .textContentType(.password)
            }
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: 360)

            if let error = authViewModel.errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task { await authViewModel.signIn(email: email, password: password) }
            } label: {
                if authViewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: 360)
            .disabled(email.isEmpty || password.isEmpty || authViewModel.isLoading)

            Button("Forgot password?") {
                showForgotPassword = true
            }
            .font(.caption)

            HStack {
                Text("Don't have an account?")
                Button("Sign Up") {
                    showSignUp = true
                }
            }
            .font(.callout)

            Spacer()
        }
        .padding()
        .sheet(isPresented: $showSignUp) {
            SignUpView(authViewModel: authViewModel)
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordView(authViewModel: authViewModel)
        }
    }
}
