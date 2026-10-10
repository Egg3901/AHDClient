import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

describe("mobile native companion safety", () => {
  it("insets the Android WebView with margins so fixed bars clear the system bars", () => {
    // Ticket 1462: padding left the site's bottom bar under three-button navigation.
    const activity = read(
      "../src-tauri/gen/android/app/src/main/java/net/lakesidegames/ahdclient/MainActivity.kt",
    );
    expect(activity).toContain("params.setMargins(bars.left, bars.top, bars.right, bars.bottom)");
    expect(activity).toContain("ViewCompat.requestApplyInsets(webView)");
  });

  it("files each Android alert under its inbox category channel", () => {
    const push = read(
      "../src-tauri/plugins/briefing-widgets/android/src/main/java/net/lakesidegames/briefing/NativePush.kt",
    );
    for (const thread of ["crisis", "election", "legislation", "party", "treasury", "standing", "system"]) {
      expect(push).toContain(`"${thread}" to`);
    }
    expect(push).toContain('val channel = thread?.let { "ahd-$it" } ?: CHANNEL');
  });

  it("keeps optional Android companions outside the app launch failure path", () => {
    const activity = read(
      "../src-tauri/gen/android/app/src/main/java/net/lakesidegames/ahdclient/MainActivity.kt",
    );
    const widget = read(
      "../src-tauri/gen/android/app/src/main/java/net/lakesidegames/ahdclient/BriefingWidget.kt",
    );
    const safety = read(
      "../src-tauri/gen/android/app/src/main/java/net/lakesidegames/ahdclient/CompanionSafety.kt",
    );
    const plugin = read(
      "../src-tauri/plugins/briefing-widgets/android/src/main/java/net/lakesidegames/briefing/BriefingPlugin.kt",
    );
    const nativeSafety = read(
      "../src-tauri/plugins/briefing-widgets/android/src/main/java/net/lakesidegames/briefing/NativeSafety.kt",
    );
    const ask = read(
      "../src-tauri/plugins/briefing-widgets/android/src/main/java/net/lakesidegames/briefing/NativeAsk.kt",
    );

    expect(activity).toContain("CompanionSafety.run");
    expect(activity).toContain('CompanionSafety.run("widget deep link")');
    expect(widget).toContain("CompanionSafety.run");
    expect(widget).toContain("jobFinished(params, false)");
    expect(safety).toContain("catch (error: Throwable)");
    expect(plugin).toContain("NativeSafety.run");
    expect(nativeSafety).toContain("catch (error: Throwable)");
    expect(ask).toContain('NativeSafety.run("native Ask presentation")');
    expect(ask).toContain('NativeSafety.run("$operation task")');
    expect(ask).toContain('NativeSafety.run("Ask answer success UI")');
    expect(plugin).toContain('NativeSafety.run("push sync")');
    expect(plugin).toContain('NativeSafety.run("push poll")');
  });

  it("never calls a blocking mobile plugin from the UI-thread navigation callbacks", () => {
    const mobile = read("../src-tauri/src/mobile.rs");
    const body = (signature: string) => {
      const start = mobile.indexOf(signature);
      expect(start).toBeGreaterThanOrEqual(0);
      return mobile.slice(start, mobile.indexOf("\n}\n", start));
    };
    // Android runs these on the UI thread; a plugin call there waits on the
    // UI thread itself and freezes the app (ticket 1450).
    for (const callback of [body("fn navigation_policy("), body("fn create_main_window(")]) {
      expect(callback).not.toMatch(/\.opener\(\)|NativeCompanion|run_mobile_plugin/);
    }
    const external = body("fn open_externally(");
    expect(external).toContain("spawn_blocking(move ||");
    expect(external.indexOf("spawn_blocking(")).toBeLessThan(external.indexOf(".opener()"));
  });

  it("keeps wry cookie calls, which abort iOS, behind one native bridge", () => {
    const srcDir = join(here, "../src-tauri/src");
    const offenders = readdirSync(srcDir)
      .filter((file) => file.endsWith(".rs") && file !== "webview_cookies.rs")
      .filter((file) =>
        /\.(cookies_for_url|cookies|delete_cookie|set_cookie)\(/.test(
          read(`../src-tauri/src/${file}`),
        ),
      );
    expect(offenders).toEqual([]);

    const bridge = read("../src-tauri/src/webview_cookies.rs");
    expect(bridge).toContain('#[cfg(target_os = "ios")]');
    expect(bridge).toContain("companion(app).cookies_for_url");

    const plugin = read(
      "../src-tauri/plugins/briefing-widgets/ios/Sources/BriefingWidgetsPlugin.swift",
    );
    expect(plugin).toContain("@objc public func cookies(_ invoke: Invoke)");
    expect(plugin).toContain(
      "@objc public func deleteCookie(_ invoke: Invoke)",
    );
    expect(plugin).toContain("DispatchQueue.main.async");
  });
});
