// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewWorldScreen } from "./App.js";

const { createWorldMock } = vi.hoisted(() => ({
  createWorldMock: vi.fn(async (options: object) => ({ meta: options })),
}));

vi.mock("./worldSetup.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./worldSetup.js")>();
  return { ...actual, createWorldWithOverrides: createWorldMock };
});

afterEach(() => {
  cleanup();
  createWorldMock.mockClear();
});

describe("new world setup", () => {
  it("keeps a player-selected era instead of reverting to the launcher default", async () => {
    const user = userEvent.setup();
    render(
      <NewWorldScreen
        initialEra="1953"
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    const selectedEra = screen.getByRole("radio", { name: /1979/i });
    await user.click(selectedEra);

    await waitFor(() => expect(selectedEra.getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByText(/1979 .* seed/i)).toBeTruthy();
  });

  it("updates playable countries when the era changes", async () => {
    const user = userEvent.setup();
    render(
      <NewWorldScreen
        initialEra="1953"
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.queryByRole("option", { name: "Brazil" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /1991/i }));

    expect(await screen.findByRole("option", { name: "Brazil" })).toBeTruthy();
  });

  it("creates with the era, country, and mode currently shown", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(
      <NewWorldScreen
        initialEra="1953"
        onBack={vi.fn()}
        onCreated={onCreated}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /1991/i }));
    await user.selectOptions(await screen.findByLabelText("Playable country"), "BR");
    await user.click(screen.getByRole("button", { name: /Head of State/i }));
    await user.click(screen.getByRole("button", { name: /Advanced/i }));
    const createButton = screen.getByRole("button", { name: "Create world" }) as HTMLButtonElement;
    const invalidValues = Array.from(document.querySelectorAll<HTMLInputElement>("input.invalid"))
      .map((input) => input.value);
    expect(invalidValues).toEqual([]);
    await waitFor(() => expect(createButton.disabled).toBe(false));
    await user.click(createButton);

    await waitFor(() => expect(createWorldMock).toHaveBeenCalledTimes(1));
    expect(createWorldMock.mock.calls[0]?.[0]).toMatchObject({
      era: "1991",
      countryId: "BR",
      homeRegionId: expect.any(String),
      mode: "hos",
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("lets the player choose a home state or region for State navigation", async () => {
    const user = userEvent.setup();
    render(
      <NewWorldScreen
        initialEra="1991"
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Playable country"), "BR");
    const homeRegion = await screen.findByLabelText("Home state or region");
    await user.selectOptions(homeRegion, "SUDESTE");
    await user.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => expect(createWorldMock).toHaveBeenCalledTimes(1));
    expect(createWorldMock.mock.calls[0]?.[0]).toMatchObject({
      countryId: "BR",
      homeRegionId: "SUDESTE",
    });
  });

  it("passes feature flag changes into world creation", async () => {
    const user = userEvent.setup();
    render(
      <NewWorldScreen
        initialEra="2019"
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Advanced/i }));
    await user.click(screen.getByRole("button", { name: "Pause all" }));
    await user.click(screen.getByRole("button", { name: "Create world" }));

    await waitFor(() => expect(createWorldMock).toHaveBeenCalledTimes(1));
    const options = createWorldMock.mock.calls[0]?.[0] as {
      featureFlags: Record<string, boolean>;
    };
    expect(Object.values(options.featureFlags).length).toBeGreaterThan(0);
    expect(Object.values(options.featureFlags).every((enabled) => !enabled)).toBe(true);
  });

  it("blocks creation while required identity fields are empty", async () => {
    const user = userEvent.setup();
    render(
      <NewWorldScreen
        initialEra="1953"
        onBack={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    const name = screen.getByLabelText("Character name");
    await user.clear(name);

    expect((screen.getByRole("button", { name: "Create world" }) as HTMLButtonElement).disabled).toBe(true);
    expect(createWorldMock).not.toHaveBeenCalled();
  });
});
