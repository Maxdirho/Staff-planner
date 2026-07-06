#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSTask *serverTask;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self createMenu];

    NSNumber *port = [self startLocalServer];
    if (!port) { [self showError:@"Non è stato possibile avviare il servizio locale dell’app."]; return; }

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    [configuration.userContentController addScriptMessageHandler:self name:@"download"];
    [configuration.userContentController addScriptMessageHandler:self name:@"saveData"];
    NSData *savedData = [NSData dataWithContentsOfURL:[self dataFileURL]];
    if (savedData.length > 0) {
        NSString *encoded = [savedData base64EncodedStringWithOptions:0];
        NSString *source = [NSString stringWithFormat:@"window.__desktopState=JSON.parse(atob('%@'));", encoded];
        WKUserScript *script = [[WKUserScript alloc] initWithSource:source injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES];
        [configuration.userContentController addUserScript:script];
    }

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.allowsMagnification = YES;

    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1180, 780)
                                                  styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
    self.window.title = @"Ore Dipendenti";
    self.window.minSize = NSMakeSize(760, 560);
    [self.window center];
    self.window.contentView = self.webView;
    [self.window makeKeyAndOrderFront:nil];

    NSURL *pageURL = [NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%@/index.html", port]];
    [self.webView loadRequest:[NSURLRequest requestWithURL:pageURL cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:15]];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.serverTask.running) [self.serverTask terminate];
}

- (NSNumber *)startLocalServer {
    NSURL *serverURL = [NSBundle.mainBundle URLForResource:@"LocalServer" withExtension:nil];
    NSURL *resourceURL = NSBundle.mainBundle.resourceURL;
    if (!serverURL || !resourceURL) return nil;
    NSPipe *pipe = [NSPipe pipe];
    self.serverTask = [[NSTask alloc] init];
    self.serverTask.executableURL = serverURL;
    self.serverTask.arguments = @[resourceURL.path];
    self.serverTask.standardOutput = pipe;
    self.serverTask.standardError = [NSPipe pipe];
    NSError *error = nil;
    if (![self.serverTask launchAndReturnError:&error]) return nil;
    NSMutableData *line = [NSMutableData data];
    NSFileHandle *handle = pipe.fileHandleForReading;
    while (line.length < 16) {
        NSData *piece = [handle readDataOfLength:1];
        if (!piece.length) return nil;
        const char c = ((const char *)piece.bytes)[0];
        if (c == '\n') break;
        [line appendData:piece];
    }
    NSString *text = [[NSString alloc] initWithData:line encoding:NSUTF8StringEncoding];
    NSInteger port = text.integerValue;
    return port > 0 ? @(port) : nil;
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.name isEqualToString:@"saveData"] && [message.body isKindOfClass:NSString.class]) {
        NSData *data = [(NSString *)message.body dataUsingEncoding:NSUTF8StringEncoding];
        NSError *error = nil;
        BOOL saved = [data writeToURL:[self dataFileURL] options:NSDataWritingAtomic error:&error];
        NSString *callback = saved ? @"window.desktopSaveResult(true);" : @"window.desktopSaveResult(false);";
        dispatch_async(dispatch_get_main_queue(), ^{ [self.webView evaluateJavaScript:callback completionHandler:nil]; });
        if (!saved) {
            [self showError:@"Non è stato possibile salvare i dati dell’app."];
        }
        return;
    }
    if (![message.name isEqualToString:@"download"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *payload = (NSDictionary *)message.body;
    NSString *name = payload[@"name"];
    NSString *encoded = payload[@"data"];
    NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded options:0];
    if (!name || !data) { [self showError:@"Non è stato possibile preparare il file."]; return; }

    NSSavePanel *panel = NSSavePanel.savePanel;
    panel.nameFieldStringValue = name;
    panel.canCreateDirectories = YES;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
        if (response != NSModalResponseOK || !panel.URL) return;
        NSError *error = nil;
        if (![data writeToURL:panel.URL options:NSDataWritingAtomic error:&error]) {
            [self showError:@"Non è stato possibile salvare il file."];
        }
    }];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    [webView evaluateJavaScript:@"typeof saveShift === 'function' && !!document.getElementById('saveShift')" completionHandler:^(id result, NSError *error) {
        if (error || ![result boolValue]) [self showError:@"L’interfaccia è stata caricata, ma il comando Salva turno non è disponibile."];
    }];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self showError:@"Non è stato possibile caricare l’interfaccia locale dell’app."];
}

- (NSURL *)dataFileURL {
    NSURL *base = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    NSURL *folder = [base URLByAppendingPathComponent:@"Ore Dipendenti" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];
    return [folder URLByAppendingPathComponent:@"dati.json"];
}

- (void)showError:(NSString *)text {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Ore Dipendenti";
        alert.informativeText = text;
        alert.alertStyle = NSAlertStyleWarning;
        [alert runModal];
    });
}

- (void)createMenu {
    NSMenu *main = [[NSMenu alloc] init];
    NSApp.mainMenu = main;

    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    [main addItem:appItem];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Ore Dipendenti"];
    appItem.submenu = appMenu;
    [appMenu addItemWithTitle:@"Informazioni su Ore Dipendenti" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Esci da Ore Dipendenti" action:@selector(terminate:) keyEquivalent:@"q"];

    NSMenuItem *editItem = [[NSMenuItem alloc] init];
    [main addItem:editItem];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Modifica"];
    editItem.submenu = editMenu;
    [editMenu addItemWithTitle:@"Annulla" action:NSSelectorFromString(@"undo:") keyEquivalent:@"z"];
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItemWithTitle:@"Taglia" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copia" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Incolla" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Seleziona tutto" action:@selector(selectAll:) keyEquivalent:@"a"];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application activateIgnoringOtherApps:YES];
        [application run];
    }
    return 0;
}
