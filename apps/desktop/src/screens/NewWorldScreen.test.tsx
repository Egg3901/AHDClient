/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewWorldScreen } from "./NewWorldScreen.js";
import type { Era } from "../worlds.js";
import { SETUP_OPTIONS_STORAGE_KEY } from "./setupOptions.js";

vi.mock("../launcher/CommandGlobe.js", () => ({ themeForEra: () => ({ phosphor: "#0f0" }) }));

const era: Era = { id: "1953", preset: "1953-default", label: "1953", subtitle: "Cold War dawn", startDate: "January 1953" };

describe("NewWorldScreen", () => {
  afterEach(() => {
    cleanup();
    localStorage.removeItem(SETUP_OPTIONS_STORAGE_KEY);
  });

  it("submits the normal setup with authored defaults", async () => {
    const onCreate = vi.fn();
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("button", { name: /Create and play/ }));
    expect(onCreate).toHaveBeenCalledWith("Cold War dawn, 1953", "", expect.objectContaining({
      mode: "normal", difficulty: "normal", autonomyLevel: "v4",
    }));
    expect(onCreate.mock.calls[0]?.[2].featureFlags).toMatchObject({ forexEnabled: true, autoSectorSeedEnabled: false, nppCorpStrategyEnabled: true });
  });

  it("supports permanent head of state and every real difficulty", async () => {
    const onCreate = vi.fn();
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={onCreate} />);

    await userEvent.click(screen.getByRole("radio", { name: /Permanent head of state/ }));
    await userEvent.selectOptions(screen.getByLabelText("Difficulty"), "hard");
    await userEvent.selectOptions(screen.getByLabelText("Autonomy"), "v3");
    await userEvent.click(screen.getByRole("button", { name: /Create and play/ }));

    expect(onCreate.mock.calls[0]?.[2]).toMatchObject({ mode: "head-of-state", difficulty: "hard", autonomyLevel: "v3" });
    expect(screen.getByRole("option", { name: /Easy/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /v5/i })).toBeNull();
  });

  it("starts worldsim mode when requested and does not show a character field", () => {
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={vi.fn()} initialWorldsim />);

    expect((screen.getByRole("radio", { name: /Worldsim/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText(/Your name/)).toBeNull();
    expect(screen.getByText(/does not create a character/)).toBeTruthy();
  });

  it("keeps anonymous statistics consent controlled and reports opt out", async () => {
    const onStatisticsChange = vi.fn();
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={vi.fn()} shareStatistics onStatisticsChange={onStatisticsChange} />);

    const checkbox = screen.getByRole("checkbox", { name: /Share anonymous setup statistics/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await userEvent.click(checkbox);
    expect(onStatisticsChange).toHaveBeenCalledWith(false);
  });

  it("persists feature choices and restores only valid values", async () => {
    const first = vi.fn();
    const { unmount } = render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={first} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Foreign exchange/ }));
    unmount();
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={first} />);
    expect((screen.getByRole("checkbox", { name: /Foreign exchange/ }) as HTMLInputElement).checked).toBe(false);
  });
});
