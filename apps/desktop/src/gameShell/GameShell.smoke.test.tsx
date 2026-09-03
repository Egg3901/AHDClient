// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { createWorld, listEras, listPlayableCountries } from "@ahdclient/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalCountryOverviewSource } from "../country/localSource.js";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import { allRouteIds } from "../navigation/resolve.js";
import { GameShell } from "./GameShell.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GameShell release smoke matrix", () => {
  it("renders every route for every supported singleplayer start without fetching", async () => {
    const fetch = vi.fn(() => {
      throw new Error("local route attempted a network request");
    });
    vi.stubGlobal("fetch", fetch);
    const routeIds = allRouteIds(NAV_MANIFEST);
    expect(routeIds.length).toBeGreaterThan(50);

    for (const era of listEras()) {
      for (const country of listPlayableCountries(era.id)) {
        const world = createWorld({
          seed: `shell-smoke-${era.id}-${country.id}`,
          playerName: "Tester",
          countryId: country.id,
          era: era.id,
        });
        const overviewModel = await new LocalCountryOverviewSource(world).load(country.id);
        for (const routeId of routeIds) {
          const view = render(
            <GameShell
              world={world}
              routeId={routeId}
              viewedCountryId={country.id}
              overviewModel={overviewModel}
              overviewError={null}
              onNavigate={vi.fn()}
              onSelectCountry={vi.fn()}
              onAdvance={vi.fn()}
              advanceBusy={false}
              onQuickSave={vi.fn()}
              saveBusy={false}
              onOpenSaves={vi.fn()}
              onExit={vi.fn()}
              onOpenCheats={vi.fn()}
              onOpenCharacter={vi.fn()}
              onWorld={vi.fn()}
              onToast={vi.fn()}
              onOpenHelp={vi.fn()}
              cheatsUsed={false}
              pausedFeatureCount={0}
            />,
          );
          expect(view.container.querySelector("main")?.textContent, `${era.id}/${country.id}/${routeId}`).toBeTruthy();
          view.unmount();
        }
      }
    }

    expect(fetch).not.toHaveBeenCalled();
  }, 120_000);
});
