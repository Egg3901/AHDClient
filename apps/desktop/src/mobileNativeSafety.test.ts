import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

describe("mobile native companion safety", () => {
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
    expect(activity).toContain("WebViewRenderProcessClient");
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
});
