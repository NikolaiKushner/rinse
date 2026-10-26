import SwiftUI

@main
struct RinseApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                #if os(macOS)
                .frame(minWidth: 480, idealWidth: 560, minHeight: 600, idealHeight: 760)
                #endif
        }
        #if os(macOS)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 560, height: 760)
        #endif
    }
}
