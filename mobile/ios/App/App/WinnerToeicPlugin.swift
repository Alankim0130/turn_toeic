import Foundation
import UIKit
import WebKit
import Capacitor
import AuthenticationServices

/// 역전토익 앱 전용 기능 — 웹사이트(winnertoeic.com)가 `window.Capacitor.Plugins.WinnerToeic` 로 부른다 (src/lib/native-app.ts).
///
/// - `signInWithApple` : Apple 로 로그인 (App Store 심사 4.8 — 카카오 · 구글 로그인이 있으면 꼭 있어야 한다)
/// - `openAuthSession`  : 카카오 · 구글 로그인을 앱 안 브라우저 창(ASWebAuthenticationSession)으로 연다.
///                        구글은 앱의 WebView 안에서 로그인하는 것을 막는다(disallowed_useragent) — 그래서 이 창을 쓴다.
/// - `getInfo`         : 앱 버전 · 이 기기의 푸시 서버(개발용 sandbox / 운영)
/// - 바깥 주소로 가는 링크는 Safari 로, 우리 주소의 새 창 링크(target=_blank)는 이 화면에서 연다 (`shouldOverrideLoad`)
@objc(WinnerToeicPlugin)
public class WinnerToeicPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WinnerToeicPlugin"
    public let jsName = "WinnerToeic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAuthSession", returnType: CAPPluginReturnPromise)
    ]

    /// 앱이 여는 사이트 — 이 주소(https)만 앱 화면 안에서 연다. 나머지는 Safari 로 보낸다.
    private let appHost = "winnertoeic.com"

    private var appleCall: CAPPluginCall?
    private var appleController: ASAuthorizationController?
    private var authCall: CAPPluginCall?
    private var authSession: ASWebAuthenticationSession?

    // MARK: - 앱 정보

    @objc func getInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary
        call.resolve([
            "version": info?["CFBundleShortVersionString"] as? String ?? "",
            "build": info?["CFBundleVersion"] as? String ?? "",
            "apnsSandbox": WinnerToeicPlugin.usesSandboxPush()
        ])
    }

    /// 푸시를 보낼 서버가 개발용(sandbox)인가 — Xcode 에서 바로 설치한 앱(개발 프로필)은 sandbox, TestFlight · App Store 앱은 운영이다.
    /// 앱에 들어 있는 프로필(embedded.mobileprovision)의 aps-environment 를 읽는다. App Store · TestFlight 앱에는 그 파일이 없다 → 운영.
    static func usesSandboxPush() -> Bool {
        guard let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
              let data = FileManager.default.contents(atPath: path),
              let text = String(data: data, encoding: .isoLatin1),
              let key = text.range(of: "<key>aps-environment</key>") else {
            return false
        }
        let afterKey = text[key.upperBound...]
        guard let open = afterKey.range(of: "<string>") else { return false }
        let afterOpen = afterKey[open.upperBound...]
        guard let close = afterOpen.range(of: "</string>") else { return false }
        return afterOpen[..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines) == "development"
    }

    // MARK: - Apple 로 로그인

    /// nonce 는 웹이 만든 값의 SHA-256 (16진수) — 원래 값은 웹이 서버로 보내 Supabase 가 대조한다.
    @objc func signInWithApple(_ call: CAPPluginCall) {
        let nonce = call.getString("nonce") ?? ""
        DispatchQueue.main.async {
            if let pending = self.appleCall {
                pending.reject("다른 로그인이 진행 중이에요.", "busy")
            }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if !nonce.isEmpty {
                request.nonce = nonce
            }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.appleCall = call
            self.appleController = controller
            controller.performRequests()
        }
    }

    private func finishApple() {
        appleCall = nil
        appleController = nil
    }

    // MARK: - 카카오 · 구글 로그인 창

    /// url 을 앱 안 브라우저 창으로 열고, 그 창이 `scheme://…` 주소로 가면 닫고 그 주소를 돌려준다.
    @objc func openAuthSession(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme?.lowercased() == "https" else {
            call.reject("로그인 주소가 올바르지 않아요.", "bad_url")
            return
        }
        let scheme = call.getString("scheme") ?? "winnertoeic"
        DispatchQueue.main.async {
            if let pending = self.authCall {
                pending.reject("다른 로그인이 진행 중이에요.", "busy")
                self.authSession?.cancel()
            }
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                DispatchQueue.main.async {
                    guard let self = self, let pending = self.authCall else { return }
                    if let callbackURL = callbackURL {
                        pending.resolve(["url": callbackURL.absoluteString])
                    } else if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                        pending.reject("로그인을 취소했어요.", "canceled")
                    } else {
                        pending.reject(error?.localizedDescription ?? "로그인하지 못했어요.", "failed")
                    }
                    self.authCall = nil
                    self.authSession = nil
                }
            }
            session.presentationContextProvider = self
            // false — 사파리에 이미 로그인한 카카오 · 구글 계정을 그대로 쓴다
            session.prefersEphemeralWebBrowserSession = false
            self.authCall = call
            self.authSession = session
            if !session.start() {
                self.authCall = nil
                self.authSession = nil
                call.reject("로그인 창을 열지 못했어요.", "failed")
            }
        }
    }

    // MARK: - 링크

    /// 앱 화면에서 열지 않을 링크를 가로챈다 — nil 은 Capacitor 의 기본 처리.
    /// Capacitor 기본은 주소가 서버 주소로 "시작하면" 앱 안에서 연다 (`winnertoeic.com.다른곳` 도 통과한다) — 호스트가 정확히 같을 때만 연다.
    /// 우리 주소의 새 창(target=_blank) 링크는 기본이 Safari 인데, Safari 에는 로그인이 없어서 이 화면에서 연다
    /// (파일이면 서버가 저장소의 서명 주소로 넘기고 → 그 주소는 바깥이라 Safari 가 그 파일을 연다).
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return nil }
        guard scheme == "https" || scheme == "http" else { return nil }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        guard mainFrame else { return nil }
        let host = url.host?.lowercased() ?? ""

        if host == appHost && scheme == "https" {
            if navigationAction.targetFrame == nil {
                DispatchQueue.main.async {
                    _ = self.bridge?.webView?.load(navigationAction.request)
                }
                return NSNumber(value: true)
            }
            return nil
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return NSNumber(value: true)
    }
}

// MARK: - Apple 로그인 결과

extension WinnerToeicPlugin: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple 로그인 정보를 받지 못했어요.", "failed")
            finishApple()
            return
        }
        var result: [String: Any] = [
            "identityToken": identityToken,
            "user": credential.user
        ]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        if let email = credential.email {
            result["email"] = email
        }
        if let givenName = credential.fullName?.givenName {
            result["givenName"] = givenName
        }
        if let familyName = credential.fullName?.familyName {
            result["familyName"] = familyName
        }
        call.resolve(result)
        finishApple()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("로그인을 취소했어요.", "canceled")
        } else {
            call.reject(error.localizedDescription, "failed")
        }
        finishApple()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? UIWindow()
    }
}

// MARK: - 로그인 창 위치

extension WinnerToeicPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? UIWindow()
    }
}
