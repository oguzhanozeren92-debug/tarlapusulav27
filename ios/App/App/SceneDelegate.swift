import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeController = CAPBridgeViewController()
        window?.rootViewController = bridgeController
        window?.makeKeyAndVisible()

        // Keep the native WKWebView from rubber-banding the entire app sideways.
        // Vertical scrolling and MapLibre's own drag gestures remain enabled.
        let appScrollView = bridgeController.webView?.scrollView
        appScrollView?.alwaysBounceHorizontal = false
        appScrollView?.showsHorizontalScrollIndicator = false
        appScrollView?.isDirectionalLockEnabled = true

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
