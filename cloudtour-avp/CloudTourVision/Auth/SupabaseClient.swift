import Foundation
import Supabase

enum AppSupabase {
    static let client: SupabaseClient = {
        // xcconfig strips `//` (treats as comment), so we store host only and prepend https://
        guard let host = Bundle.main.infoDictionary?["SUPABASE_HOST"] as? String,
              !host.isEmpty,
              let url = URL(string: "https://\(host)"),
              let anonKey = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String,
              !anonKey.isEmpty else {
            fatalError("Missing SUPABASE_HOST or SUPABASE_ANON_KEY in Info.plist. Copy Config.xcconfig.example to Config.xcconfig and fill in your keys.")
        }
        return SupabaseClient(supabaseURL: url, supabaseKey: anonKey)
    }()
}
