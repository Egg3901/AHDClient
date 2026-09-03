import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPrototypeRuntime,
  type CountryOverviewModel,
} from "./session.js";
import "./country-overview-prototype.css";

type Variant = "a" | "b" | "c";

const VARIANTS: Array<{ id: Variant; label: string }> = [
  { id: "a", label: "Mainline hierarchy" },
  { id: "b", label: "Cabinet briefing" },
  { id: "c", label: "Command dashboard" },
];

function currentVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "b" || value === "c" ? value : "a";
}

function setVariantInUrl(variant: Variant): void {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  window.history.replaceState(null, "", url);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function PrototypeSwitcher({
  variant,
  onVariant,
}: {
  variant: Variant;
  onVariant: (variant: Variant) => void;
}) {
  const index = VARIANTS.findIndex((entry) => entry.id === variant);
  const cycle = useCallback(
    (direction: number) => {
      const next =
        VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length]!;
      onVariant(next.id);
    },
    [index, onVariant],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycle]);

  return (
    <div
      className="cop-switcher"
      role="toolbar"
      aria-label="Prototype variants"
    >
      <button onClick={() => cycle(-1)} aria-label="Previous variant">
        &#8592;
      </button>
      <span>
        <strong>{variant.toUpperCase()}</strong> {VARIANTS[index]?.label}
      </span>
      <button onClick={() => cycle(1)} aria-label="Next variant">
        &#8594;
      </button>
    </div>
  );
}

function TopBar({
  model,
  busy,
  onAdvance,
}: {
  model: CountryOverviewModel;
  busy: boolean;
  onAdvance: () => void;
}) {
  return (
    <nav className="cop-topbar">
      <a
        className="cop-brand"
        href="?prototype=country-overview&variant=a"
        aria-label="A House Divided"
      >
        <span className="cop-brand-mark">AHD</span>
        <span>A House Divided</span>
      </a>
      <div className="cop-navlinks">
        <button className="active">World</button>
        <button>Politics</button>
        <button>Economy</button>
        <button>Elections</button>
      </div>
      <div className="cop-player-status">
        <span>
          <small>TURN</small>
          {model.world.turn}
        </span>
        <span>
          <small>ACTIONS</small>
          {model.player.actions}
        </span>
        <span>
          <small>FUNDS</small>
          {formatNumber(model.player.funds)}
        </span>
        <button className="cop-primary" onClick={onAdvance} disabled={busy}>
          {busy ? "Processing" : "End turn"}
        </button>
      </div>
    </nav>
  );
}

function Hero({ model }: { model: CountryOverviewModel }) {
  return (
    <header className="cop-hero">
      <div className="cop-hero-art" aria-hidden="true">
        <span>US</span>
      </div>
      <div className="cop-hero-content">
        <div className="cop-hero-top">
          <span className="cop-back">&#8592; World</span>
          <span className="cop-live">
            <i />
            {model.registration.label}
          </span>
        </div>
        <div>
          <p>{model.country.regionLabel}</p>
          <h1>{model.country.name}</h1>
        </div>
      </div>
      <div className="cop-vitals">
        {model.leaders.slice(0, 3).map((leader) => (
          <div key={leader.label}>
            <small>{leader.label}</small>
            <strong>{leader.name ?? "Vacant"}</strong>
            <span>{leader.party ?? "Office unfilled"}</span>
          </div>
        ))}
        <div>
          <small>Government type</small>
          <strong>{model.country.governmentType}</strong>
          <span>Era {model.world.era}</span>
        </div>
        <div>
          <small>World date</small>
          <strong>{model.world.date}</strong>
          <span>Turn {model.world.turn}</span>
        </div>
      </div>
    </header>
  );
}

function Directory({ model }: { model: CountryOverviewModel }) {
  return (
    <div className="cop-directory">
      {model.directory.map((group) => (
        <section key={group.label}>
          <h2>{group.label}</h2>
          <div>
            {group.items.map((item) => (
              <button key={item.id} className="cop-directory-row">
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <b>{item.figure}</b>
                <i>&#8250;</i>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EconomyStrip({ model }: { model: CountryOverviewModel }) {
  return (
    <section className="cop-economy">
      <div className="cop-section-head">
        <div>
          <small>National economy</small>
          <h2>Vital signs</h2>
        </div>
        <span>Updated turn {model.world.turn}</span>
      </div>
      <div className="cop-stat-grid">
        {model.economy.map((stat) => (
          <article key={stat.label} data-tone={stat.tone}>
            <small>{stat.label}</small>
            <strong>{stat.value}</strong>
            <span>{stat.detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function Legislature({ model }: { model: CountryOverviewModel }) {
  const held = Math.max(
    1,
    model.legislature.seats - model.legislature.vacancies,
  );
  return (
    <section className="cop-legislature">
      <div className="cop-section-head">
        <div>
          <small>National legislature</small>
          <h2>{model.legislature.name}</h2>
        </div>
        <span>{model.legislature.seats} seats</span>
      </div>
      <div className="cop-seatbar">
        {model.legislature.parties.map((party) => (
          <span
            key={party.id}
            style={{
              width: `${(party.seats / held) * 100}%`,
              backgroundColor: party.color,
            }}
            title={`${party.name}: ${party.seats}`}
          />
        ))}
      </div>
      <div className="cop-party-list">
        {model.legislature.parties.slice(0, 6).map((party) => (
          <div key={party.id}>
            <i style={{ backgroundColor: party.color }} />
            <span>
              <strong>{party.abbreviation}</strong>
              <small>{party.name}</small>
            </span>
            <b>{party.seats}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChamberBalance({ model }: { model: CountryOverviewModel }) {
  const economic = ((model.chamberBalance.economic + 5) / 10) * 100;
  const social = ((model.chamberBalance.social + 5) / 10) * 100;
  return (
    <section className="cop-ideology">
      <div className="cop-section-head">
        <div>
          <small>Seat-weighted party positions</small>
          <h2>Legislative balance</h2>
        </div>
        <span>
          {model.chamberBalance.representedParties} represented parties
        </span>
      </div>
      <label>
        Economic <span>Left</span>
        <b>
          <i style={{ left: `${economic}%` }} />
        </b>
        <span>Right</span>
      </label>
      <label>
        Social <span>Libertarian</span>
        <b>
          <i style={{ left: `${social}%` }} />
        </b>
        <span>Authoritarian</span>
      </label>
    </section>
  );
}

function MainlineVariant({ model }: { model: CountryOverviewModel }) {
  return (
    <main className="cop-page cop-mainline">
      <Hero model={model} />
      <section>
        <p className="cop-kicker">Explore {model.country.name}</p>
        <Directory model={model} />
      </section>
      <p className="cop-descriptor">{model.country.descriptor}</p>
      <div className="cop-two-col">
        <EconomyStrip model={model} />
        <ChamberBalance model={model} />
      </div>
      <Legislature model={model} />
    </main>
  );
}

function BriefingVariant({ model }: { model: CountryOverviewModel }) {
  return (
    <main className="cop-page cop-briefing">
      <div className="cop-brief-head">
        <div>
          <p>Presidential daily brief</p>
          <h1>{model.country.name}</h1>
          <span>
            {model.world.date} / turn {model.world.turn}
          </span>
        </div>
        <div className="cop-seal">US</div>
      </div>
      <div className="cop-brief-grid">
        <div className="cop-brief-main">
          <h2>National conditions</h2>
          <EconomyStrip model={model} />
          <h2>Institutions</h2>
          <Directory model={model} />
        </div>
        <aside>
          <section>
            <small>Player</small>
            <h3>{model.player.name}</h3>
            <p>{model.player.party}</p>
            <dl>
              <div>
                <dt>Actions</dt>
                <dd>{model.player.actions}</dd>
              </div>
              <div>
                <dt>Cash</dt>
                <dd>{formatNumber(model.player.cash)}</dd>
              </div>
              <div>
                <dt>Funds</dt>
                <dd>{formatNumber(model.player.funds)}</dd>
              </div>
            </dl>
          </section>
          <section>
            <small>Latest intelligence</small>
            {model.latestNews.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
          <ChamberBalance model={model} />
        </aside>
      </div>
    </main>
  );
}

function CommandVariant({ model }: { model: CountryOverviewModel }) {
  return (
    <main className="cop-page cop-command">
      <header>
        <span>NATIONAL COMMAND / {model.country.id}</span>
        <h1>{model.country.name.toUpperCase()}</h1>
        <p>
          WORLD {model.world.seed} / {model.world.date} / T+{model.world.turn}
        </p>
      </header>
      <div className="cop-command-grid">
        <section className="wide">
          <h2>ECONOMIC TELEMETRY</h2>
          <EconomyStrip model={model} />
        </section>
        <section>
          <h2>EXECUTIVE</h2>
          {model.leaders.map((leader) => (
            <div className="cop-command-row" key={leader.label}>
              <span>{leader.label}</span>
              <strong>{leader.name ?? "VACANT"}</strong>
            </div>
          ))}
        </section>
        <section>
          <h2>LEGISLATURE</h2>
          <Legislature model={model} />
        </section>
        <section className="wide">
          <h2>DIRECTORY</h2>
          <Directory model={model} />
        </section>
      </div>
    </main>
  );
}

export function CountryOverviewPrototype(): JSX.Element {
  const runtime = useMemo(() => createPrototypeRuntime(), []);
  const [model, setModel] = useState<CountryOverviewModel | null>(null);
  const [variant, setVariant] = useState<Variant>(() => currentVariant());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void runtime.reader.read("US").then(setModel);
  }, [runtime]);
  const onVariant = useCallback((next: Variant) => {
    setVariant(next);
    setVariantInUrl(next);
  }, []);
  const onAdvance = async () => {
    setBusy(true);
    try {
      await runtime.advanceTurn();
      setModel(await runtime.reader.read("US"));
    } finally {
      setBusy(false);
    }
  };

  if (!model)
    return <div className="cop-loading">Preparing local world...</div>;
  return (
    <div className="cop-root">
      <TopBar model={model} busy={busy} onAdvance={() => void onAdvance()} />
      {variant === "a" ? (
        <MainlineVariant model={model} />
      ) : variant === "b" ? (
        <BriefingVariant model={model} />
      ) : (
        <CommandVariant model={model} />
      )}
      <details className="cop-contract">
        <summary>Adapter state</summary>
        <pre>{JSON.stringify(model, null, 2)}</pre>
      </details>
      <PrototypeSwitcher variant={variant} onVariant={onVariant} />
    </div>
  );
}
