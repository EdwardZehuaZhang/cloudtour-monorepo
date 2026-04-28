import SwiftUI
import UniformTypeIdentifiers
import Supabase

/// M6.2 — pick a `.ply` / `.splat` / `.spz` from Files, validate magic
/// bytes locally, create a scene row, upload to Supabase Storage at the
/// canonical path, and stamp the scene's `splat_file_format`.
///
/// We talk to Supabase directly (no BE round-trip) — the AVP currently
/// has no HTTP layer. RLS gates `scenes.insert` + `splat-files.upload` on
/// org editor+ role, so this is safe. Plan limit + 10/hour rate limit
/// (enforced by the BE upload route on web) are intentionally NOT enforced
/// here in v1; FE remains the canonical path for those checks. Tracked
/// as a follow-up if AVP-only orgs ship.
struct SplatUploadView: View {
    let tour: Tour

    var onSceneCreated: (Scene) -> Void = { _ in }

    @State private var pickedFile: PickedSplatFile?
    @State private var sceneTitle: String = ""
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var showingPicker = false
    @State private var progress: Double = 0
    @Environment(\.dismiss) private var dismiss

    enum Phase: Equatable {
        case idle
        case validating
        case ready
        case creatingScene
        case uploading
        case finalizing
        case done
        case failed
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("File") {
                    Button {
                        showingPicker = true
                    } label: {
                        Label(pickedFile == nil ? "Choose splat file…" : (pickedFile!.url.lastPathComponent),
                              systemImage: "doc.badge.plus")
                    }
                    .disabled(phase == .uploading || phase == .creatingScene || phase == .finalizing)
                    if let f = pickedFile {
                        LabeledContent("Format", value: f.format.uppercased())
                        LabeledContent("Size", value: ByteCountFormatter.string(fromByteCount: Int64(f.size), countStyle: .file))
                    }
                    Text("Supported: .ply, .splat, .spz. Magic bytes validated before upload.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Scene") {
                    TextField("Scene title", text: $sceneTitle)
                        .disabled(phase == .uploading || phase == .creatingScene || phase == .finalizing)
                }

                if phase == .uploading || phase == .creatingScene || phase == .finalizing {
                    Section("Progress") {
                        ProgressView(value: progress)
                        Text(statusText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Upload Splat")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(phase == .uploading || phase == .creatingScene || phase == .finalizing)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Upload") {
                        Task { await runUpload() }
                    }
                    .disabled(!canUpload)
                }
            }
            .fileImporter(
                isPresented: $showingPicker,
                allowedContentTypes: Self.allowedTypes,
                allowsMultipleSelection: false
            ) { result in
                handlePicker(result: result)
            }
        }
    }

    private var canUpload: Bool {
        guard let pickedFile else { return false }
        guard phase == .ready || phase == .idle else { return false }
        guard !sceneTitle.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        return pickedFile.size > 0
    }

    private var statusText: String {
        switch phase {
        case .idle: return ""
        case .validating: return "Validating file…"
        case .ready: return "Ready to upload."
        case .creatingScene: return "Creating scene row…"
        case .uploading: return "Uploading splat to storage…"
        case .finalizing: return "Stamping scene metadata…"
        case .done: return "Upload complete."
        case .failed: return "Failed."
        }
    }

    static var allowedTypes: [UTType] {
        // .ply has a registered UTI in Files; .splat / .spz do not, so fall
        // back to the generic data type and rely on extension-based hinting.
        var types: [UTType] = [.data]
        if let ply = UTType(filenameExtension: "ply") { types.append(ply) }
        return types
    }

    // MARK: - File picker

    private func handlePicker(result: Result<[URL], Error>) {
        errorMessage = nil
        progress = 0
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            phase = .validating
            Task { await validatePickedFile(at: url) }
        case .failure(let error):
            errorMessage = "Picker error: \(error.localizedDescription)"
            phase = .failed
        }
    }

    private func validatePickedFile(at url: URL) async {
        // Files-picked URLs require a security-scoped resource lock to read.
        let didStart = url.startAccessingSecurityScopedResource()
        defer { if didStart { url.stopAccessingSecurityScopedResource() } }

        do {
            let ext = url.pathExtension.lowercased()
            guard ["ply", "splat", "spz"].contains(ext) else {
                throw UploadError.unsupportedExtension(ext)
            }
            let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
            let size = (attrs[.size] as? UInt64) ?? 0
            guard size > 0 else { throw UploadError.emptyFile }

            let fh = try FileHandle(forReadingFrom: url)
            defer { try? fh.close() }
            let head = try fh.read(upToCount: 16) ?? Data()
            try Self.validateMagicBytes(extension: ext, head: head, size: size)

            // Take a copy into the app's tmp dir so we can release the
            // security-scoped reference and still upload after a UI pause.
            let scratch = FileManager.default.temporaryDirectory
                .appendingPathComponent("upload-\(UUID().uuidString).\(ext)")
            if FileManager.default.fileExists(atPath: scratch.path) {
                try FileManager.default.removeItem(at: scratch)
            }
            try FileManager.default.copyItem(at: url, to: scratch)

            await MainActor.run {
                self.pickedFile = PickedSplatFile(url: scratch, format: ext, size: Int(size))
                if self.sceneTitle.isEmpty {
                    self.sceneTitle = url.deletingPathExtension().lastPathComponent
                }
                self.phase = .ready
            }
        } catch {
            await MainActor.run {
                self.errorMessage = (error as? UploadError)?.userMessage ?? error.localizedDescription
                self.phase = .failed
            }
        }
    }

    /// Magic-byte validator. PLY: ASCII `ply\n` / `ply\r\n`. SPZ: 4-byte
    /// magic `4e 47 53 50` ("NGSP"). SPLAT: no fixed magic — file size must
    /// be a positive multiple of 32 (raw `gaussian-splat-3d` struct size).
    static func validateMagicBytes(extension ext: String, head: Data, size: UInt64) throws {
        switch ext {
        case "ply":
            guard head.count >= 4 else { throw UploadError.magicMismatch("ply") }
            let prefix = head.prefix(4)
            let asAscii = String(data: prefix, encoding: .ascii) ?? ""
            guard asAscii.hasPrefix("ply\n") || asAscii.hasPrefix("ply\r") else {
                throw UploadError.magicMismatch("ply")
            }
        case "spz":
            guard head.count >= 4 else { throw UploadError.magicMismatch("spz") }
            let m = [UInt8](head.prefix(4))
            // Niantic reference encoder emits 0x5053474e LE = N G S P bytes.
            guard m == [0x4e, 0x47, 0x53, 0x50] else {
                throw UploadError.magicMismatch("spz")
            }
        case "splat":
            guard size > 0, size % 32 == 0 else {
                throw UploadError.splatNotAlignedToStructSize
            }
        default:
            throw UploadError.unsupportedExtension(ext)
        }
    }

    // MARK: - Upload pipeline

    private func runUpload() async {
        guard let file = pickedFile else { return }
        let title = sceneTitle.trimmingCharacters(in: .whitespaces)
        let nextSortOrder = 0 // BE accepts; trigger / FE will renumber later
        await MainActor.run { phase = .creatingScene; errorMessage = nil; progress = 0.05 }

        do {
            // 1. Create scene row directly via Supabase. RLS gates on org
            //    editor+; identical to how SplatViewerView writes scene_edits.
            struct SceneInsert: Encodable {
                let tour_id: String
                let title: String
                let sort_order: Int
            }
            let inserted: Scene = try await AppSupabase.client
                .from("scenes")
                .insert(SceneInsert(
                    tour_id: tour.id.uuidString,
                    title: title,
                    sort_order: nextSortOrder
                ))
                .select()
                .single()
                .execute()
                .value

            await MainActor.run { phase = .uploading; progress = 0.2 }

            // 2. Upload to canonical path. `upsert: true` so a re-run after
            //    a partial failure overwrites the half-uploaded blob rather
            //    than 409-ing forever.
            let storagePath = "\(tour.orgId.uuidString)/\(tour.id.uuidString)/\(inserted.id.uuidString)/scene.\(file.format)"
            let opts = FileOptions(
                contentType: contentType(for: file.format),
                upsert: true
            )
            _ = try await AppSupabase.client.storage
                .from("splat-files")
                .upload(storagePath, fileURL: file.url, options: opts)

            await MainActor.run { phase = .finalizing; progress = 0.85 }

            // 3. Stamp `splat_file_format` directly. `splat_url` stays nil:
            //    `SplatViewerView.resolveSplatURL` falls back to a freshly-
            //    minted signed URL using the deterministic storage path.
            struct SceneFormatUpdate: Encodable { let splat_file_format: String }
            let stamped: Scene = try await AppSupabase.client
                .from("scenes")
                .update(SceneFormatUpdate(splat_file_format: file.format))
                .eq("id", value: inserted.id.uuidString)
                .select()
                .single()
                .execute()
                .value

            // Best-effort cleanup of the scratch copy.
            try? FileManager.default.removeItem(at: file.url)

            await MainActor.run {
                phase = .done
                progress = 1.0
                onSceneCreated(stamped)
                dismiss()
            }
        } catch {
            await MainActor.run {
                errorMessage = "Upload failed: \(error.localizedDescription)"
                phase = .failed
            }
        }
    }

    private func contentType(for format: String) -> String {
        switch format {
        case "ply": return "application/octet-stream"
        case "splat": return "application/octet-stream"
        case "spz": return "application/octet-stream"
        default: return "application/octet-stream"
        }
    }
}

private struct PickedSplatFile: Equatable {
    let url: URL
    let format: String   // ply / splat / spz
    let size: Int
}

private enum UploadError: Error {
    case unsupportedExtension(String)
    case emptyFile
    case magicMismatch(String)
    case splatNotAlignedToStructSize

    var userMessage: String {
        switch self {
        case .unsupportedExtension(let ext):
            return "Unsupported file extension '.\(ext)'. Choose .ply, .splat, or .spz."
        case .emptyFile:
            return "File is empty."
        case .magicMismatch(let format):
            return "Magic-byte check failed: this does not look like a valid \(format.uppercased()) file."
        case .splatNotAlignedToStructSize:
            return "Invalid .splat file (size is not a multiple of 32 bytes)."
        }
    }
}
