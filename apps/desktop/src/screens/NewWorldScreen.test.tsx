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
    // Only tiers the game's setup route accepts are offered. v5 is now one of
    // them; v6 is the guard that this list is not just "whatever we typed".
    expect(screen.queryByRole("option", { name: /v6/i })).toBeNull();
  });

  it("offers the v5 tier and submits it, without making it the default", async () => {
    const onCreate = vi.fn();
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={onCreate} />);

    expect((screen.getByLabelText("Autonomy") as HTMLSelectElement).value).toBe("v4");
    await userEvent.selectOptions(screen.getByLabelText("Autonomy"), "v5");
    await userEvent.click(screen.getByRole("button", { name: /Create and play/ }));
    expect(onCreate.mock.calls[0]?.[2]).toMatchObject({ autonomyLevel: "v5" });
  });

  it("restores a stored v5 preference instead of silently downgrading it", async () => {
    const onCreate = vi.fn();
    localStorage.setItem(
      SETUP_OPTIONS_STORAGE_KEY,
      JSON.stringify({ mode: "normal", difficulty: "normal", autonomyLevel: "v5", featureFlags: {} })
    );
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={onCreate} />);
    expect((screen.getByLabelText("Autonomy") as HTMLSelectElement).value).toBe("v5");
  });

  /**
   * Autonomy is what the politicians may do; difficulty is how well they do it.
   * The resource advantage is stated as a resource advantage, never dressed up
   * as skill.
   */
  it("tells the player which axis is which, and discloses the resource bonus", () => {
    render(<NewWorldScreen era={era} taken={[]} onBack={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText(/allowed to do\. Each step adds activities, not skill/)).toBeTruthy();
    expect(screen.getByText(/never changes what they are allowed to do/)).toBeTruthy();
    expect(screen.getByText(/same action points and funding as you do/)).toBeTruthy();
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
