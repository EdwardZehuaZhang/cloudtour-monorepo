import SwiftUI

struct MembersView: View {
    @Bindable var viewModel: MembersViewModel
    @State private var showInviteSheet = false
    @State private var inviteEmail = ""
    @State private var inviteRole = "editor"

    var body: some View {
        NavigationStack {
            List {
                ForEach(viewModel.members) { member in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(member.displayName ?? member.invitedEmail ?? "Unknown")
                                .font(.headline)
                            if let email = member.invitedEmail {
                                Text(email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        Text(member.role.capitalized)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.fill.tertiary, in: Capsule())

                        if member.joinedAt == nil {
                            Text("Pending")
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                    }
                }
                .onDelete { indexSet in
                    Task {
                        for index in indexSet {
                            await viewModel.removeMember(viewModel.members[index])
                        }
                    }
                }
            }
            .navigationTitle("Members")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showInviteSheet = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                    }
                }
            }
            .sheet(isPresented: $showInviteSheet) {
                NavigationStack {
                    Form {
                        TextField("Email address", text: $inviteEmail)
                            .textContentType(.emailAddress)
                            #if os(iOS) || os(visionOS)
                            .textInputAutocapitalization(.never)
                            #endif

                        Picker("Role", selection: $inviteRole) {
                            Text("Viewer").tag("viewer")
                            Text("Editor").tag("editor")
                            Text("Admin").tag("admin")
                        }
                    }
                    .navigationTitle("Invite Member")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showInviteSheet = false
                                inviteEmail = ""
                            }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Send Invite") {
                                Task {
                                    await viewModel.inviteMember(email: inviteEmail, role: inviteRole)
                                    showInviteSheet = false
                                    inviteEmail = ""
                                }
                            }
                            .disabled(inviteEmail.isEmpty)
                        }
                    }
                }
            }
            .overlay {
                if viewModel.members.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView("No Members", systemImage: "person.2", description: Text("Invite team members to collaborate."))
                }
            }
            .task {
                if viewModel.members.isEmpty {
                    await viewModel.loadMembers()
                }
            }
            .refreshable {
                await viewModel.loadMembers()
            }
        }
    }
}
