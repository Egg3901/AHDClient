import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { WorldState } from "@ahdclient/engine";
import { NAV_MANIFEST } from "../navigation/manifest.js";
import type { Destination } from "../navigation/types.js";
import { findDestination, sectionDestinations } from "../navigation/resolve.js";
import { CountryOverviewScreen } from "../country/CountryOverviewScreen.js";
import type { CountryOverviewModel } from "../country/model.js";
import { CountryDetailsScreen } from "../countryDetails/CountryDetailsScreen.js";
import { GovernmentScreen } from "../government/Government.js";
import { EconomyScreen } from "../economy/Economy.js";
import { MarketsScreen } from "../markets/Markets.js";
import { WorldMapScreen } from "../worldMap/WorldMap.js";
import { PartiesScreen } from "../parties/Parties.js";
import { CongressScreen } from "../congress/Congress.js";
import { ElectionsScreen } from "../elections/Elections.js";
import { CorporationsScreen } from "../corporations/Corporations.js";
import { CampaignsScreen } from "../campaigns/Campaigns.js";
import { HeadOfStateScreen } from "../hos/HeadOfState.js";
import { NewsScreen, NewsWidget } from "../news/NewsFeed.js";
import { ActionsHub } from "../actions/ActionsHub.js";
import "../elections/elections.css";
import { targetForRoute } from "./routeMap.js";
import { buildSummary } from "./summaries.js";
import { RouteSummaryPanel } from "./summaryPanel.js";
import "./gameShell.css";

export interface GameShellProps {
  world: WorldState;
  /** Stable local route id. nation.home is the default. Never a URL. */
  routeId: string;
  viewedCountryId: string;
  /** Overview model loaded through LocalCountryOverviewSource by the parent. */
  overviewModel: CountryOverviewModel | null;
  overviewError: string | null;
  onNavigate: (routeId: string) => void;
  onSelectCountry: (countryId: string) => void;
  onAdvance: () => void;
  advanceBusy: boolean;
  onQuickSave: () => void;
  saveBusy: boolean;
  onOpenSaves: () => void;
  onExit: () => void;
  onOpenCheats: () => void;
  onOpenCharacter: () => void;
  onWorld: (world: WorldState) => void;
  onToast: (message: string) => void;
  onOpenOnline: () => void;
  cheatsUsed: boolean;
  pausedFeatureCount: number;
  statusFooter?: ReactNode;
}

function GateBadges({ destination }: { destination: Destination }) {
  return (
    <>
      {destination.multiplayerOnly === true ? (
        <span className="gs-badge">Multiplayer</span>
      ) : null}
      {destination.requiresCondition !== undefined ? (
        <span className="gs-badge gs-badge-gate">{destination.requiresCondition}</span>
      ) : null}
    </>
  );
}

function ShellPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel gs-panel">
      <h1 className="gs-panel-title">{title}</h1>
      {children}
    </div>
  );
}

function localReason(destination: Destination | undefined): string | undefined {
  return destination?.availability.local.desktop.reason.replace(/^Desktop:\s*/, "");
}

function LocalSummary({
  routeId,
  world,
  viewedCountryId,
}: {
  routeId: string;
  world: WorldState;
  viewedCountryId: string;
}) {
  const destination = findDestination(NAV_MANIFEST, routeId);
  const model = buildSummary(routeId, world, viewedCountryId);
  if (model === null) {
    return (
      <ShellPanel title={destination?.label ?? routeId}>
        <p className="muted">
          Route {routeId} has no summary projection in this shell.
        </p>
      </ShellPanel>
    );
  }
  return (
    <RouteSummaryPanel
      model={model}
      reason={localReason(destination)}
    />
  );
}

function MultiplayerState({ routeId }: { routeId: string }) {
  const destination = findDestination(NAV_MANIFEST, routeId);
  return (
    <ShellPanel title={destination?.label ?? routeId}>
      <p>
        <span className="gs-badge">Multiplayer only</span>
      </p>
      <p className="muted">
        {localReason(destination) ??
          "This destination has no local-world source."}
      </p>
      <p className="muted small">
        Singleplayer worlds run fully on this device, so there is no
        cross-player record to show here.
      </p>
    </ShellPanel>
  );
}

function HelpPanel({
  routeId,
  onOpenOnline,
}: {
  routeId: string;
  onOpenOnline: () => void;
}) {
  const destination = findDestination(NAV_MANIFEST, routeId);
  return (
    <ShellPanel title={destination?.label ?? routeId}>
      <p className="muted">
        {localReason(destination) ?? "Help opens outside the local world."}
      </p>
      <button type="button" onClick={onOpenOnline}>
        Open online help
      </button>
    </ShellPanel>
  );
}

function NationPicker({
  world,
  viewedCountryId,
  onSelectCountry,
}: {
  world: WorldState;
  viewedCountryId: string;
  onSelectCountry: (countryId: string) => void;
}) {
  const countries = useMemo(
    () => Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)),
    [world.countries],
  );
  return (
    <ShellPanel title="Switch nation view">
      <p className="muted small">
        Picker over the local world disabling nothing: the home badge marks
        the home nation.
      </p>
      <ul className="gs-picker-list">
        {countries.map((country) => (
          <li key={country.id}>
            <button
              type="button"
              className="gs-picker-row"
              aria-current={country.id === viewedCountryId}
              onClick={() => onSelectCountry(country.id)}
            >
              <span className="gs-row-text">
                <strong>{country.name}</strong>
                <small className="muted">{country.id}</small>
              </span>
              {country.id === world.player.countryId ? (
                <span className="gs-badge">Home</span>
              ) : null}
              {country.id === viewedCountryId ? (
                <span className="gs-badge">Viewing</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </ShellPanel>
  );
}

export function GameShell(props: GameShellProps) {
  const {
    world,
    routeId,
    viewedCountryId,
    overviewModel,
    overviewError,
    onNavigate,
    onSelectCountry,
    onAdvance,
    advanceBusy,
    onQuickSave,
    saveBusy,
    onOpenSaves,
    onExit,
    onOpenCheats,
    onOpenCharacter,
    onWorld,
    onToast,
    onOpenOnline,
    cheatsUsed,
    pausedFeatureCount,
    statusFooter,
  } = props;
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen && openSection === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setOpenSection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, openSection]);

  const goHome = () => onNavigate("nation.home");
  const navigateAndClose = (id: string) => {
    setOpenSection(null);
    setDrawerOpen(false);
    onNavigate(id);
  };

  const countryName =
    world.countries[viewedCountryId]?.name ?? viewedCountryId;
  const activeSection = NAV_MANIFEST.sections.find((section) =>
    sectionDestinations(section).some((d) => d.id === routeId),
  )?.id;
  const isHos = world.player.mode === "hos";
  const busy = advanceBusy || saveBusy;

  const renderMenuItems = (sectionId: string) => {
    const section = NAV_MANIFEST.sections.find((s) => s.id === sectionId);
    if (!section) return null;
    return sectionDestinations(section).map((destination) => (
      <li key={destination.id} role="none">
        <button
          type="button"
          role="menuitem"
          className="gs-menu-item"
          data-route={destination.id}
          aria-current={destination.id === routeId}
          onClick={() => navigateAndClose(destination.id)}
        >
          <span className="gs-row-text">
            <strong>{destination.label}</strong>
            {destination.labelNote ? (
              <small className="muted">{destination.labelNote}</small>
            ) : null}
          </span>
          <GateBadges destination={destination} />
        </button>
      </li>
    ));
  };

  const target = targetForRoute(routeId);
  let content: ReactNode;
  switch (target.kind) {
    case "overview":
      content =
        overviewModel !== null ? (
          <CountryOverviewScreen
            model={overviewModel}
            onNavigate={onNavigate}
            onAdvance={onAdvance}
            onQuickSave={onQuickSave}
            busy={busy}
          />
        ) : (
          <ShellPanel title={countryName}>
            {overviewError !== null ? (
              <p role="alert">{overviewError}</p>
            ) : (
              <p className="muted">Loading the home-nation overview.</p>
            )}
            <button type="button" className="secondary" onClick={goHome}>
              Back to overview
            </button>
          </ShellPanel>
        );
      break;
    case "actions":
      content = (
        <>
          <div className="panel">
            <ActionsHub world={world} onWorld={onWorld} onToast={onToast} />
          </div>
          <NewsWidget news={world.news} onOpen={() => onNavigate("world.news")} />
        </>
      );
      break;
    case "parties":
      content = (
        <PartiesScreen
          world={world}
          onBack={goHome}
          initialCountryId={viewedCountryId}
        />
      );
      break;
    case "elections":
      content = (
        <ElectionsScreen
          world={world}
          onWorld={onWorld}
          onToast={onToast}
          onBack={goHome}
          onOpenCharacter={onOpenCharacter}
          initialCountryId={viewedCountryId}
        />
      );
      break;
    case "congress":
      content = (
        <CongressScreen
          world={world}
          onWorld={onWorld}
          onToast={onToast}
          onBack={goHome}
          initialCountryId={viewedCountryId}
        />
      );
      break;
    case "government":
      content = (
        <GovernmentScreen
          world={world}
          onBack={goHome}
          initialCountryId={viewedCountryId}
        />
      );
      break;
    case "economy":
      content = (
        <EconomyScreen
          world={world}
          onBack={goHome}
          countryId={viewedCountryId}
        />
      );
      break;
    case "markets":
      content = (
        <MarketsScreen
          world={world}
          onWorld={onWorld}
          onBack={goHome}
          countryId={viewedCountryId}
        />
      );
      break;
    case "worldMap":
      content = <WorldMapScreen world={world} onBack={goHome} />;
      break;
    case "corporations":
      content = <CorporationsScreen world={world} onBack={goHome} />;
      break;
    case "campaigns":
      content = <CampaignsScreen world={world} onBack={goHome} />;
      break;
    case "hos":
      content = (
        <HeadOfStateScreen
          world={world}
          onWorld={onWorld}
          onToast={onToast}
          onBack={goHome}
          onOpenLegislative={() => onNavigate("nation.government.legislature")}
          onOpenEconomy={() => onNavigate("nation.economy.economy")}
        />
      );
      break;
    case "news":
      content = (
        <NewsScreen
          news={world.news}
          onBack={goHome}
          worldTurn={world.meta.turn}
          worldDate={world.meta.date}
        />
      );
      break;
    case "countryDetail":
      content = (
        <CountryDetailsScreen
          world={world}
          countryId={viewedCountryId}
          routeId={target.detailRouteId ?? routeId}
          onBack={goHome}
        />
      );
      break;
    case "switchView":
      content = (
        <NationPicker
          world={world}
          viewedCountryId={viewedCountryId}
          onSelectCountry={onSelectCountry}
        />
      );
      break;
    case "summary":
      content = (
        <LocalSummary
          routeId={routeId}
          world={world}
          viewedCountryId={viewedCountryId}
        />
      );
      break;
    case "multiplayerOnly":
      content = <MultiplayerState routeId={routeId} />;
      break;
    case "help":
      content = <HelpPanel routeId={routeId} onOpenOnline={onOpenOnline} />;
      break;
    case "unknown":
    default:
      content = (
        <ShellPanel title="Unknown destination">
          <p className="muted">
            Route {routeId} is not a known local destination.
          </p>
          <button type="button" className="secondary" onClick={goHome}>
            Back to overview
          </button>
        </ShellPanel>
      );
      break;
  }

  return (
    <div className="gs-root">
      <header className="gs-bar">
        <div className="gs-brand-row">
          <button
            type="button"
            className="gs-burger"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <span aria-hidden="true">&#9776;</span>
          </button>
          <button
            type="button"
            className="gs-brand"
            onClick={goHome}
            title="Home nation overview"
          >
            <strong>{countryName}</strong>
            <span className="muted small">
              Turn {world.meta.turn} / {world.meta.date} / {world.meta.era}
            </span>
          </button>
          {cheatsUsed ? <span className="cheats-tag">CHEATS ACTIVE</span> : null}
          {pausedFeatureCount > 0 ? (
            <span className="cheats-tag">{pausedFeatureCount} SYSTEMS PAUSED</span>
          ) : null}
        </div>
        <nav className="gs-nav" aria-label="Game sections">
          {NAV_MANIFEST.sections.map((section) => (
            <div key={section.id} className="gs-menu-wrap">
              <button
                type="button"
                className="gs-nav-btn"
                aria-haspopup="true"
                aria-expanded={openSection === section.id}
                aria-current={activeSection === section.id}
                onClick={() =>
                  setOpenSection((current) =>
                    current === section.id ? null : section.id,
                  )
                }
              >
                {section.title}
              </button>
              {openSection === section.id ? (
                <ul className="gs-menu" role="menu" aria-label={section.title}>
                  {renderMenuItems(section.id)}
                </ul>
              ) : null}
            </div>
          ))}
          {isHos ? (
            <button
              type="button"
              className="gs-nav-btn hos-nav-btn"
              onClick={() => navigateAndClose("local.hos")}
            >
              Head of state
            </button>
          ) : null}
        </nav>
        <div className="gs-utils" aria-label="Game actions">
          <button type="button" className="secondary gs-utility-btn" onClick={onOpenCharacter}>
            Character
          </button>
          <button type="button" className="secondary gs-utility-btn" onClick={onOpenCheats}>
            Tools
          </button>
          <button type="button" className="gs-utility-btn" onClick={onAdvance} disabled={busy}>
            {advanceBusy ? "Processing" : "End turn"}
          </button>
          <button
            type="button"
            className="secondary gs-utility-btn"
            onClick={onQuickSave}
            disabled={busy}
            title="Quick save (Ctrl/Cmd+S)"
          >
            {saveBusy ? "Saving" : "Quick save"}
          </button>
          <button
            type="button"
            className="secondary gs-utility-btn"
            onClick={onOpenSaves}
            disabled={busy}
          >
            Save manager
          </button>
          <button type="button" className="secondary gs-utility-btn" onClick={onExit}>
            Back to launcher
          </button>
        </div>
      </header>
      {drawerOpen ? (
        <div className="gs-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div
            className="gs-drawer"
            role="dialog"
            aria-label="Game sections"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gs-drawer-head">
              <strong>{countryName}</strong>
              <button
                type="button"
                className="secondary gs-drawer-close"
                onClick={() => setDrawerOpen(false)}
              >
                Close
              </button>
            </div>
            {NAV_MANIFEST.sections.map((section) => (
              <section key={section.id} aria-label={section.title}>
                <h2 className="gs-drawer-section">{section.title}</h2>
                <ul className="gs-drawer-list">
                  {sectionDestinations(section).map((destination) => (
                    <li key={destination.id}>
                      <button
                        type="button"
                        className="gs-drawer-item"
                        data-route={destination.id}
                        aria-current={destination.id === routeId}
                        onClick={() => navigateAndClose(destination.id)}
                      >
                        <span className="gs-row-text">
                          <strong>{destination.label}</strong>
                        </span>
                        <GateBadges destination={destination} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {isHos ? (
              <button
                type="button"
                className="gs-drawer-item hos-nav-btn"
                onClick={() => navigateAndClose("local.hos")}
              >
                Head of state
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <main className="gs-content">{content}</main>
      {statusFooter !== undefined ? (
        <div className="panel muted small gs-status">{statusFooter}</div>
      ) : null}
    </div>
  );
}
