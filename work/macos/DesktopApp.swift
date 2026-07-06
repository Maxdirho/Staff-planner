import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        createMenu()

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "download")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.allowsMagnification = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Ore Dipendenti"
        window.minSize = NSSize(width: 760, height: 560)
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)

        guard let resourceURL = Bundle.main.resourceURL else {
            showError("Le risorse dell’app non sono disponibili.")
            return
        }
        let pageURL = resourceURL.appendingPathComponent("index.html")
        webView.loadFileURL(pageURL, allowingReadAccessTo: resourceURL)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "download",
              let payload = message.body as? [String: Any],
              let name = payload["name"] as? String,
              let encoded = payload["data"] as? String,
              let data = Data(base64Encoded: encoded) else {
            showError("Non è stato possibile preparare il file.")
            return
        }

        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try data.write(to: url, options: .atomic)
            } catch {
                self.showError("Non è stato possibile salvare il file.")
            }
        }
    }

    private func showError(_ text: String) {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText = "Ore Dipendenti"
            alert.informativeText = text
            alert.alertStyle = .warning
            alert.runModal()
        }
    }

    private func createMenu() {
        let main = NSMenu()
        NSApp.mainMenu = main

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "Informazioni su Ore Dipendenti", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Esci da Ore Dipendenti", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let editMenu = NSMenu(title: "Modifica")
        editItem.submenu = editMenu
        editMenu.addItem(withTitle: "Annulla", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Taglia", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copia", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Incolla", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Seleziona tutto", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let windowItem = NSMenuItem()
        main.addItem(windowItem)
        let windowMenu = NSMenu(title: "Finestra")
        windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Riduci a icona", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.activate(ignoringOtherApps: true)
application.run()
