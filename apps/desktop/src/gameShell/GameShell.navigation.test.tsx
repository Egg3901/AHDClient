// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { createWorld, type WorldState } from "@ahdclient/engine";
import { describe, expect, it, vi } from "vitest";
import { LocalCountryOverviewSource } from "../country/localSource.js";
import { GameShell, type GameShellProps } from "./GameShell.js";

async function renderShell(
  world: WorldState,
  overrides: Partial<GameShellProps> = {},
) {
  const viewedCountryId = overrides.viewedCountryId ?? world.player.countryId;
  const overviewModel = await new LocalCountryOverviewSource(world).load(viewedCountryId);
  const props: GameShellProps = {
    world,
    routeId: "nation.home",
    viewedCountryId,
    overviewModel,
    overviewError: null,
    onNavigate: vi.fn(),
    onSelectCountry: vi.fn(),
    onAdvance: vi.fn(),
    advanceBusy: false,
    onQuickSave: vi.fn(),
    saveBusy: false,
    onOpenSaves: vi.fn(),
    onExit: vi.fn(),
    onOpenCheats: vi.fn(),
    onOpenCharacter: vi.fn(),
    onWorld: vi.fn(),
    onToast: vi.fn(),
    onOpenHelp: vi.fn(),
    cheatsUsed: false,
    pausedFeatureCount: 0,
    ...overrides,
  };
  return { ...render(<GameShell {...props} />), props };
}

function navButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>(".gs-nav-btn")]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`missing nav button ${label}`);
  return button;
}

describe("GameShell multiplayer navigation parity", () => {
  it("keeps Nation groups and puts Switch nation view last", async () => {
    const world = createWorld({ seed: "nav-groups", playerName: "Tester", countryId: "US", era: "1953" });
    world.player.partyId = Object.values(world.parties).find((party) => party.countryId === "US")!.id;
    const view = await renderShell(world);

    fireEvent.click(navButton(view.container, "United States"));
    const menu = view.getByRole("menu", { name: "United States" });
    for (const heading of ["Home Nation", "Politics", "Other", "Government", "Economy"]) {
      expect(
        [...menu.querySelectorAll(".gs-menu-heading")].some(
          (candidate) => candidate.textContent === heading,
        ),
      ).toBe(true);
    }
    expect(menu.querySelector('[data-route="nation.home"]')?.textContent).toContain("United States (Home)");
    expect(menu.querySelector('[data-route="nation.my-party"]')?.textContent).toContain(
      world.parties[world.player.partyId]!.name,
    );
    expect(menu.querySelector('[data-route="nation.government.legislature"]')?.textContent).toContain(
      world.legislatures.US!.name,
    );
    const ids = [...menu.querySelectorAll<HTMLElement>("[data-route]")].map((node) => node.dataset.route);
    expect(ids.at(-1)).toBe("nation.switch-view");
  });

  it("shows a disabled My Election: None entry without a home-region candidacy", async () => {
    const world = createWorld({ seed: "nav-empty-election", playerName: "Tester", countryId: "US", era: "1953", homeRegionId: "CA" });
    const view = await renderShell(world);
    fireEvent.click(navButton(view.container, "California"));
    const item = view.container.querySelector<HTMLButtonElement>('[data-route="state.my-election"]');
    expect(item?.textContent).toContain("My Election: None");
    expect(item?.disabled).toBe(true);
  });

  it("takes Home Nation back to the player country after switching view", async () => {
    const world = createWorld({ seed: "nav-home", playerName: "Tester", countryId: "US", era: "1953" });
    const onSelectCountry = vi.fn();
    const onNavigate = vi.fn();
    const view = await renderShell(world, { viewedCountryId: "UK", onSelectCountry, onNavigate });
    fireEvent.click(navButton(view.container, "United Kingdom"));
    fireEvent.click(view.container.querySelector('[data-route="nation.home"]')!);
    expect(onSelectCountry).toHaveBeenCalledWith("US");
    expect(onNavigate).not.toHaveBeenCalledWith("nation.home");
  });

  it("opens My Party on the player's country and selected party", async () => {
    const world = createWorld({ seed: "nav-my-party", playerName: "Tester", countryId: "US", era: "1953" });
    const parties = Object.values(world.parties).filter((party) => party.countryId === "US");
    world.player.partyId = parties.at(-1)!.id;
    const view = await renderShell(world, { routeId: "nation.my-party", viewedCountryId: "UK" });
    expect(view.getByText(/United States · Turn/)).toBeTruthy();
    expect(view.container.querySelector(`[aria-pressed="true"]`)?.textContent).toContain(
      world.parties[world.player.partyId]!.name,
    );
  });
});
