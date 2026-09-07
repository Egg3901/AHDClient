/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SettingsMenu } from "./SettingsMenu.js";
import { DEFAULT_SETTINGS } from "./settings.js";

vi.mock("./UpdateControl.js", () => ({
  UpdateControl: () => <p>Desktop updates</p>,
}));

describe("SettingsMenu", () => {
  afterEach(cleanup);

  it("shows the local game and updater preferences on desktop", () => {
    render(
      <SettingsMenu open settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={vi.fn()} onReportIssue={vi.fn()} onOpenDiagnostics={vi.fn()} />,
    );
    expect(screen.getByText("Separate gameplay window")).toBeTruthy();
    expect(screen.getByText("Technical startup logs")).toBeTruthy();
    expect(screen.getByText("Desktop updates")).toBeTruthy();
    expect(screen.getByText("Developer diagnostics")).toBeTruthy();
  });

  it("keeps only animation and issue reporting on mobile", () => {
    render(
      <SettingsMenu mobile open settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={vi.fn()} onReportIssue={vi.fn()} onOpenDiagnostics={vi.fn()} />,
    );
    expect(screen.getByText("Launcher animation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report issue" })).toBeTruthy();
    expect(screen.getByText("Developer diagnostics")).toBeTruthy();
    expect(screen.queryByText("Separate gameplay window")).toBeNull();
    expect(screen.queryByText("Anonymous simulation statistics")).toBeNull();
    expect(screen.queryByText("Technical startup logs")).toBeNull();
    expect(screen.queryByText("Desktop updates")).toBeNull();
  });
});
