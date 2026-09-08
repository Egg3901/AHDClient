import XCTest

final class LaunchTests: XCTestCase {
    func testNativeAuthenticatedScreens() {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        if app.tabBars.buttons["Agents"].waitForExistence(timeout: 5) {
            XCTAssertTrue(app.staticTexts["Game server"].waitForExistence(timeout: 10))
            capture(app, "Ops overview")
            app.tabBars.buttons["Agents"].tap()
            let agent = app.staticTexts["Test agent"]
            XCTAssertTrue(agent.waitForExistence(timeout: 10)); agent.tap()
            XCTAssertTrue(app.staticTexts["Deployment checks passed."].waitForExistence(timeout: 10))
            capture(app, "Native agent conversation")
        } else {
            let conversation = app.staticTexts["How does inflation work?"]
            XCTAssertTrue(conversation.waitForExistence(timeout: 10)); conversation.tap()
            XCTAssertTrue(app.staticTexts["Prices respond to supply and demand."].waitForExistence(timeout: 10))
            capture(app, "Native Ask conversation")
            let composer = app.textViews.firstMatch
            XCTAssertTrue(composer.waitForExistence(timeout: 5)); composer.tap(); composer.typeText("What changes prices?")
            app.buttons["Send question"].tap()
            XCTAssertTrue(app.staticTexts["Verified final answer from the server."].waitForExistence(timeout: 10))
            XCTAssertFalse(app.staticTexts["A partial draft"].exists)
            capture(app, "Completed streamed answer")
        }
        XCTAssertEqual(app.webViews.count, 0)
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testNativeSignInAndCancellation() {
        let app = XCUIApplication(); app.launch()
        let signIn = app.buttons["Sign in to Lakeside"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 15))
        XCTAssertEqual(app.webViews.count, 0)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.lifetime = .keepAlways; add(screenshot)
        signIn.tap()
        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        cancel.tap()
        XCTAssertTrue(signIn.waitForExistence(timeout: 5))
        XCTAssertEqual(app.webViews.count, 0)
    }
}
