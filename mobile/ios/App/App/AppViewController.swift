import UIKit
import Capacitor

/// 앱 화면 — Capacitor 화면에 우리 앱 전용 기능(WinnerToeicPlugin)을 붙인다.
/// 앱 프로젝트 안에 둔 플러그인은 저절로 등록되지 않아 여기서 직접 넣는다 (Capacitor 문서 "Custom Native iOS Code").
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WinnerToeicPlugin())
        // 왼쪽 끝에서 밀면 이전 화면으로 (사파리처럼) — 앱에는 뒤로 가기 버튼이 없다
        webView?.allowsBackForwardNavigationGestures = true
    }
}
