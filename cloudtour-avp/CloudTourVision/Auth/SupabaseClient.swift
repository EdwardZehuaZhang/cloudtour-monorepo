import Foundation
import Supabase

enum AppSupabase {
    static let client: SupabaseClient = {
        guard let urlString = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String,
              let url = URL(string: urlString),
              let anonKey = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String else {
            fatalError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in Info.plist. Copy Config.xcconfig.example to Config.xcconfig and fill in your keys.")
        }
        return SupabaseClient(supabaseURL: url, supabaseKey: anonKey)
    }()
}
