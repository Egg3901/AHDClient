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
        guard app.tabBars.buttons["Hub"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops workbench") }
        app.buttons["Conversations"].tap()
        XCTAssertTrue(app.staticTexts["Build the studio hub"].waitForExistence(timeout: 5))
        capture(app, "Ops conversation history")
        app.buttons["Done"].tap()
        app.tabBars.buttons["Hub"].tap()
        app.buttons["ops-files-open"].tap()
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
        XCTAssertTrue(routing.waitForExistence(timeout: 10)); waitForEnabled(routing); routing.tap()
        let provider = app.descendants(matching: .any).matching(identifier: "ops-routing-provider").firstMatch
        XCTAssertTrue(provider.waitForExistence(timeout: 10)); waitForEnabled(provider); provider.tap()
        app.buttons["Grok"].tap()
        let fallback = app.switches["ops-routing-fallback"]
        XCTAssertEqual(fallback.value as? String, "0", "Manual routing must require an explicit fallback opt-in")
        app.descendants(matching: .any).matching(identifier: "ops-routing-model").firstMatch.tap(); app.buttons["Fixture model"].tap()
        app.descendants(matching: .any).matching(identifier: "ops-routing-effort").firstMatch.tap(); app.buttons["High"].tap()
        app.buttons["ops-routing-save"].tap()
        XCTAssertTrue(routing.waitForExistence(timeout: 5))
        XCTAssertTrue(routing.label.contains("Grok"))
        routing.tap()
        XCTAssertTrue(provider.waitForExistence(timeout: 10)); waitForEnabled(provider)
        XCTAssertEqual(provider.value as? String, "Grok")
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "ops-routing-model").firstMatch.value as? String, "Fixture model")
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "ops-routing-effort").firstMatch.value as? String, "High")
        capture(app, "Ops persisted manual routing")
        provider.tap(); app.buttons["Free Router"].tap()
        XCTAssertFalse(app.descendants(matching: .any).matching(identifier: "ops-routing-effort").firstMatch.isEnabled)
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
        XCTAssertEqual(activity.value as? String, "Expanded")
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
        // UIKit can report an invalid activation point for offscreen SwiftUI rows.
        // Scroll from geometry first, then let tap resolve the visible element.
        for _ in 0..<8 {
            if element.exists {
                let frame = element.frame
                let top = app.frame.minY + 130
                let bottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY - 12 : app.frame.maxY - 125
                if frame.width > 0 && frame.height > 0 && frame.minY >= top && frame.maxY <= bottom { return }
                if frame.height > 0 && frame.midY < top { app.swipeDown(); continue }
            }
            if upward { app.swipeUp() } else { app.swipeDown() }
        }
        XCTAssertTrue(element.exists)
    }
    func testOpsCompanyCreatesWorkWithCompletionChecks() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops company") }
        app.tabBars.buttons["Hub"].tap(); app.buttons["ops-company-open"].tap()
        XCTAssertTrue(app.buttons["ops-company-create"].waitForExistence(timeout: 10))
        app.buttons["ops-company-view-options"].tap()
        app.buttons.matching(NSPredicate(format: "label == %@", "List")).firstMatch.tap()
        capture(app, "Ops company overview")
        app.buttons["ops-company-create"].tap()
        fillCompanyField("ops-company-title", with: "Check the release notes", in: app)
        fillCompanyField("ops-company-objective", with: "Prepare accurate release notes", in: app)
        fillCompanyField("ops-company-why", with: "The release needs a clear explanation", in: app)
        fillCompanyField("ops-company-criteria", with: "Every change is linked to a check", in: app)
        app.buttons["ops-company-create-save"].tap()
        XCTAssertTrue(app.staticTexts["Check the release notes"].waitForExistence(timeout: 10))
        app.staticTexts["Check the release notes"].tap()
        XCTAssertTrue(app.staticTexts["ops-company-criterion-0"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["ops-company-criterion-0"].label, "Every change is linked to a check")
        capture(app, "Ops work with completion checks")
    }
    func testOpsCompanyRecordsAnOwnerCheck() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops company checks") }
        app.tabBars.buttons["Hub"].tap(); app.buttons["ops-company-open"].tap()
        XCTAssertTrue(app.buttons["ops-company-view-options"].waitForExistence(timeout: 10))
        app.buttons["ops-company-view-options"].tap()
        app.buttons.matching(NSPredicate(format: "label == %@", "List")).firstMatch.tap()
        let job = app.buttons["ops-company-job-job-1"]
        XCTAssertTrue(job.waitForExistence(timeout: 10)); job.tap()
        XCTAssertTrue(app.staticTexts["Several projects could not export their files."].waitForExistence(timeout: 10))
        app.buttons["ops-company-more"].tap()
        let record = app.buttons.matching(identifier: "ops-company-record-check").firstMatch
        XCTAssertTrue(record.waitForExistence(timeout: 5)); record.tap()
        fillCompanyField("ops-company-check-summary", with: "Checked an empty export and confirmed the download completed", in: app)
        XCTAssertTrue(app.staticTexts["Recorded by you. This is your assessment, not an automated test result."].exists)
        app.buttons["ops-company-action-save"].tap()
        XCTAssertTrue(app.buttons["ops-company-more"].waitForExistence(timeout: 10))
        let test = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Test · Passed")).firstMatch
        XCTAssertTrue(test.waitForExistence(timeout: 10)); scrollTo(test, in: app); test.tap()
        XCTAssertTrue(app.staticTexts["Source: Recorded by you"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Checked an empty export and confirmed the download completed"].exists)
        capture(app, "Ops owner recorded check")
    }
    private func fillCompanyField(_ identifier: String, with text: String, in app: XCUIApplication) {
        let field = app.textFields[identifier].exists ? app.textFields[identifier] : app.textViews[identifier]
        XCTAssertTrue(field.waitForExistence(timeout: 5)); scrollTo(field, in: app); field.tap(); field.typeText(text)
    }
    func testOpsKanbanMovesAWorkCard() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops board") }
        app.tabBars.buttons["Hub"].tap(); app.buttons["ops-company-open"].tap()
        let board = app.descendants(matching: .any)["ops-kanban-board"].firstMatch
        XCTAssertTrue(board.waitForExistence(timeout: 10))
        let menu = app.buttons["ops-kanban-move-job-1"]
        scrollTo(menu, in: app)
        capture(app, "Ops shared work board")
        menu.tap()
        let destination = app.buttons.matching(identifier: "ops-kanban-move-to-doing").firstMatch
        XCTAssertTrue(destination.waitForExistence(timeout: 5)); destination.tap()
        let moved = app.descendants(matching: .any)["ops-kanban-card-job-1-doing"].firstMatch
        XCTAssertTrue(moved.waitForExistence(timeout: 10))
        XCTAssertFalse(app.descendants(matching: .any)["ops-kanban-card-job-1-todo"].firstMatch.exists)
        capture(app, "Ops acknowledged board move")
        app.buttons["ops-company-job-job-1"].tap()
        XCTAssertTrue(app.staticTexts["ops-company-current-status"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["ops-company-current-status"].label, "In progress")
        XCTAssertTrue(app.staticTexts["Several projects could not export their files."].exists)
    }
    func testOpsLiveAgentActivityOpensRealToolDetails() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest-fixtures", "--uitest-live-activity"]; app.launch()
        guard app.tabBars.buttons["Team"].waitForExistence(timeout: 5) else { throw XCTSkip("Ops live activity") }
        let live = app.buttons["ops-live-activity-open"]
        XCTAssertTrue(live.waitForExistence(timeout: 10))
        capture(app, "Ops live assistant presence")
        live.tap()
        XCTAssertTrue(app.navigationBars["Live activity"].waitForExistence(timeout: 5))
        let search = app.textFields["ops-activity-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap(); search.typeText("npm test\n")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label == %@", "Running export checks")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["No matching activity"].exists)
        capture(app, "Ops live tool inspector")
        app.buttons["Done"].tap()
        XCTAssertTrue(live.waitForExistence(timeout: 5))
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
