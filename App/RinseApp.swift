import SwiftUI

@main
struct RinseApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                #if os(macOS)
                .frame(minWidth: 420, minHeight: 520)
                #endif
        }
        #if os(macOS)
        .windowResizability(.contentSize)
        #endif
    }
}
