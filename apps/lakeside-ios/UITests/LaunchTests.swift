import XCTest

final class LaunchTests: XCTestCase {
    func testNativeAuthenticatedScreens() {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        if app.tabBars.buttons["Team"].waitForExistence(timeout: 5) {
            XCTAssertTrue(app.staticTexts["Help me build the studio hub."].waitForExistence(timeout: 10))
            capture(app, "Ops assistant")
            app.tabBars.buttons["Team"].tap()
            let worker = app.staticTexts["Export repair"]
            XCTAssertTrue(worker.waitForExistence(timeout: 10)); worker.tap()
            XCTAssertTrue(app.staticTexts["Export fixed. All checks passed."].waitForExistence(timeout: 10))
            capture(app, "Ops worker report")
            app.tabBars.buttons["Usage"].tap()
            XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "5-hour allowance")).firstMatch.waitForExistence(timeout: 10))
            capture(app, "Ops measured usage")
        } else {
            let conversation = app.staticTexts["How does inflation work?"]
            XCTAssertTrue(conversation.waitForExistence(timeout: 10)); conversation.tap()
            XCTAssertTrue(app.staticTexts["Prices respond to supply and demand."].waitForExistence(timeout: 10))
            capture(app, "Native Ask conversation")
            let composer = app.textFields["ask-composer"].exists ? app.textFields["ask-composer"] : app.textViews["ask-composer"]
            XCTAssertTrue(composer.waitForExistence(timeout: 5)); composer.tap(); composer.typeText("What changes prices?")
            app.buttons["Send question"].tap()
            XCTAssertTrue(app.staticTexts["Verified final answer from the server."].waitForExistence(timeout: 10))
            XCTAssertFalse(app.staticTexts["A partial draft"].exists)
            capture(app, "Completed streamed answer")
        }
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testAskOptionsUsageAndStarters() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        if app.tabBars.buttons["Team"].waitForExistence(timeout: 3) { throw XCTSkip("Ask features") }
        XCTAssertTrue(app.buttons["Daily allowance"].waitForExistence(timeout: 10))
        capture(app, "Ask 1.1 home")
        app.buttons["Daily allowance"].tap()
        XCTAssertTrue(app.staticTexts["Question credits"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["153.5 left"].exists)
        capture(app, "Ask allowance bars")
        app.buttons["Done"].tap()
        app.buttons["Explore questions"].tap()
        XCTAssertTrue(app.navigationBars["Explore questions"].waitForExistence(timeout: 5))
        capture(app, "Ask starter browser")
        app.buttons["Done"].tap()
        app.staticTexts["How does inflation work?"].tap()
        app.buttons["Answer options"].tap()
        XCTAssertTrue(app.staticTexts["Charts, diagrams, and maps"].waitForExistence(timeout: 5))
        capture(app, "Ask response options")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Verify"].exists)
        XCTAssertTrue(app.buttons["Autopsy"].exists)
        XCTAssertTrue(app.buttons["Scenario"].exists)
        app.buttons["Share conversation"].tap()
        XCTAssertTrue(app.buttons["Create public link"].waitForExistence(timeout: 5))
        app.buttons["Create public link"].tap()
        XCTAssertTrue(app.staticTexts["Your link is ready."].waitForExistence(timeout: 5))
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testNativeAskChartAndMap() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures", "--uitest-visuals"]; app.launch()
        if app.tabBars.buttons["Team"].waitForExistence(timeout: 3) { throw XCTSkip("Ask visualizations") }
        let conversation = app.staticTexts["How does inflation work?"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 10)); conversation.tap()
        XCTAssertTrue(app.staticTexts["GDP growth"].waitForExistence(timeout: 10))
        capture(app, "Native Ask chart")
        app.swipeUp()
        let expand = app.buttons["Expand game map"]
        XCTAssertTrue(expand.waitForExistence(timeout: 10)); expand.tap()
        XCTAssertTrue(app.navigationBars["Game map"].waitForExistence(timeout: 5))
        capture(app, "Native Ask map")
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testOpsWorkbench() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Files"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops workbench") }
        app.buttons["Conversations"].tap()
        XCTAssertTrue(app.staticTexts["Build the studio hub"].waitForExistence(timeout: 5))
        capture(app, "Ops conversation history")
        app.buttons["Done"].tap()
        app.tabBars.buttons["Files"].tap()
        app.staticTexts["Studio hub"].tap()
        app.staticTexts["app.swift"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "let version")).firstMatch.waitForExistence(timeout: 5))
        capture(app, "Ops source preview")
        app.buttons["Changes"].tap()
        XCTAssertTrue(app.staticTexts["+let version = 1.3"].waitForExistence(timeout: 5))
        capture(app, "Ops file diff")
        app.tabBars.buttons["Hub"].tap()
        app.buttons["Schedules"].tap()
        XCTAssertTrue(app.staticTexts["Morning review"].waitForExistence(timeout: 5))
        capture(app, "Ops schedule controls")
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testOpsStaffAndActivity() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops staff") }
        let activity = app.buttons["ops-activity"]
        XCTAssertTrue(activity.waitForExistence(timeout: 10)); activity.tap()
        let search = app.textFields["ops-activity-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap(); search.typeText("missing-command\n")
        XCTAssertTrue(app.staticTexts["No matching activity"].waitForExistence(timeout: 5))
        capture(app, "Ops searchable activity")
        app.tabBars.buttons["Team"].tap()
        XCTAssertTrue(app.staticTexts["Release engineer"].waitForExistence(timeout: 5))
        capture(app, "Ops staff and assignments")
        app.staticTexts["Release engineer"].tap()
        XCTAssertTrue(app.staticTexts["Verify exports before release."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Export repair"].exists)
        capture(app, "Ops persistent staff profile")
        app.buttons["Assign work"].tap()
        XCTAssertTrue(app.textFields["ops-assignment-title"].waitForExistence(timeout: 5))
        capture(app, "Ops new assignment")
        app.buttons["Cancel"].tap()
        app.tabBars.buttons["Usage"].tap()
        for _ in 0..<8 {
            if app.buttons["Provider benchmarks"].isHittable { break }
            app.swipeUp()
        }
        app.buttons["Provider benchmarks"].tap()
        XCTAssertTrue(app.staticTexts["Measure before routing"].waitForExistence(timeout: 5))
        capture(app, "Ops provider benchmarks")
        XCTAssertEqual(app.webViews.count, 0)
    }
    func testOpsManualRoutingPersistsAndFreeRouterHasNoEffort() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops routing") }
        let routing = app.buttons["ops-routing-open"]
        XCTAssertTrue(routing.waitForExistence(timeout: 10)); routing.tap()
        let provider = app.buttons["ops-routing-provider"]
        XCTAssertTrue(provider.waitForExistence(timeout: 10)); waitForEnabled(provider); provider.tap()
        app.buttons["Grok"].tap()
        let fallback = app.switches["ops-routing-fallback"]
        XCTAssertEqual(fallback.value as? String, "0", "Manual routing must require an explicit fallback opt-in")
        app.buttons["ops-routing-model"].tap(); app.buttons["Fixture model"].tap()
        app.buttons["ops-routing-effort"].tap(); app.buttons["High"].tap()
        app.buttons["ops-routing-save"].tap()
        XCTAssertTrue(routing.waitForExistence(timeout: 5))
        XCTAssertTrue(routing.label.contains("Grok"))
        routing.tap()
        XCTAssertTrue(provider.waitForExistence(timeout: 10)); waitForEnabled(provider)
        XCTAssertEqual(provider.value as? String, "Grok")
        XCTAssertEqual(app.buttons["ops-routing-model"].value as? String, "Fixture model")
        XCTAssertEqual(app.buttons["ops-routing-effort"].value as? String, "High")
        capture(app, "Ops persisted manual routing")
        provider.tap(); app.buttons["Free Router"].tap()
        XCTAssertFalse(app.buttons["ops-routing-effort"].isEnabled)
        XCTAssertEqual(app.switches["ops-routing-fallback"].value as? String, "0")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "FreeRouter supports text chat")).firstMatch.exists)
        capture(app, "Ops FreeRouter chat routing")
    }
    func testOpsWorkerTimelineAndProviderSubagent() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops worker inspector") }
        app.tabBars.buttons["Team"].tap()
        let worker = app.staticTexts["Export repair"]
        XCTAssertTrue(worker.waitForExistence(timeout: 10)); worker.tap()
        let activity = app.buttons["ops-worker-activity-toggle"]
        scrollTo(activity, in: app); activity.tap()
        XCTAssertTrue(app.staticTexts["Checking the export implementation."].waitForExistence(timeout: 10))
        let output = app.buttons["Show output"]
        scrollTo(output, in: app); output.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "All 12 checks passed")).firstMatch.waitForExistence(timeout: 5))
        capture(app, "Ops structured worker tool output")
        scrollTo(activity, in: app, upward: false); activity.tap()
        let children = app.buttons["ops-subagents"]
        scrollTo(children, in: app); children.tap()
        let child = app.buttons["ops-subagent-child-1"]
        XCTAssertTrue(child.waitForExistence(timeout: 10)); scrollTo(child, in: app); child.tap()
        let childActivity = app.buttons["ops-worker-activity-toggle"]
        XCTAssertTrue(childActivity.waitForExistence(timeout: 5)); childActivity.tap()
        XCTAssertTrue(app.staticTexts["Reviewed empty exports and unicode filenames."].waitForExistence(timeout: 10))
        capture(app, "Ops saved provider subagent activity")
        XCTAssertEqual(app.webViews.count, 0)
    }
    private func waitForEnabled(_ element: XCUIElement) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed)
    }
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication, upward: Bool = true) {
        for _ in 0..<8 {
            if element.isHittable { return }
            if upward { app.swipeUp() } else { app.swipeDown() }
        }
        XCTAssertTrue(element.isHittable)
    }
    func testOpsCapacityAtLargeTextSize() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-fixtures", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 3) else { throw XCTSkip("Ops capacity only") }
        app.tabBars.buttons["Usage"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["ops-provider-codex"].firstMatch.waitForExistence(timeout: 10))
        capture(app, "Ops capacity large text")
        for _ in 0..<12 {
            if app.descendants(matching: .any)["ops-provider-freerouter"].firstMatch.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(app.descendants(matching: .any)["ops-provider-freerouter"].firstMatch.isHittable)
        capture(app, "Ops route capacity large text")
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }
    func testAttachmentMenu() {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        if !app.tabBars.buttons["Team"].waitForExistence(timeout: 3) {
            let conversation = app.staticTexts["How does inflation work?"]
            XCTAssertTrue(conversation.waitForExistence(timeout: 10)); conversation.tap()
        }
        let add = app.buttons["add-attachment"]
        XCTAssertTrue(add.waitForExistence(timeout: 10)); add.tap()
        XCTAssertTrue(app.buttons["Photo library"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Choose file"].exists)
        capture(app, "Native attachment picker")
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
