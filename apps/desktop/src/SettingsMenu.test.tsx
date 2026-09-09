/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SettingsMenu } from "./SettingsMenu.js";
import { DEFAULT_SETTINGS } from "./settings.js";

vi.mock("./UpdateControl.js", () => ({
  UpdateControl: () => <p>Desktop updates</p>,
}));

vi.mock("./PushControl.js", () => ({ PushControl: () => <p>Push notifications</p> }));

describe("SettingsMenu", () => {
  afterEach(cleanup);

  it("sections desktop settings into Launcher, Game, Updates and Support", () => {
    render(
      <SettingsMenu open settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={vi.fn()} onReportIssue={vi.fn()} onOpenDiagnostics={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Launcher" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Game" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Support" })).toBeTruthy();
    expect(screen.getByText("Separate gameplay window")).toBeTruthy();
    expect(screen.getByText("Anonymous simulation statistics")).toBeTruthy();
    expect(screen.getByText("Desktop updates")).toBeTruthy();
  });

  it("keeps Advanced collapsed and uses player copy", () => {
    render(
      <SettingsMenu open settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={vi.fn()} onReportIssue={vi.fn()} onOpenDiagnostics={vi.fn()} />,
    );
    const advanced = document.querySelector("details.client-settings-advanced");
    expect(advanced).toBeTruthy();
    expect((advanced as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GitHub/);
  });

  it("shows the mobile short variant without desktop-only rows", () => {
    render(
      <SettingsMenu mobile open settings={DEFAULT_SETTINGS} onChange={vi.fn()} onClose={vi.fn()} onReportIssue={vi.fn()} onOpenDiagnostics={vi.fn()} />,
    );
    expect(screen.getByText("Push notifications")).toBeTruthy();
    expect(screen.getByText("Launcher animation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy();
    expect(screen.getByText("Developer diagnostics")).toBeTruthy();
    expect(screen.queryByText("Separate gameplay window")).toBeNull();
    expect(screen.queryByText("Anonymous simulation statistics")).toBeNull();
    expect(screen.queryByText("Technical startup logs")).toBeNull();
    expect(screen.queryByText("Desktop updates")).toBeNull();
  });
});
