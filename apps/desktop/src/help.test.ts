import { describe, expect, it } from "vitest";
import { reportIssueRoute } from "./help.js";

describe("reportIssueRoute", () => {
  it("keeps mobile issue reporting inside the app", () => {
    expect(reportIssueRoute(true)).toBe("help.suggestions");
  });

  it("retains the detailed GitHub report form on desktop", () => {
    expect(reportIssueRoute(false)).toBe("help.report-issue");
  });
});
