import { useEffect, useState } from "react";
import type { Era } from "../worlds.js";
import { themeForEra } from "../launcher/CommandGlobe.js";
import type { SetupAutonomy, SetupDifficulty, SetupMode, SetupOptions } from "./setupOptions.js";
import { readSetupOptions, writeSetupOptions } from "./setupOptions.js";
import { FEATURE_OPTIONS, type FeatureFlagKey } from "./featureOptions.js";

export type { SetupOptions } from "./setupOptions.js";

interface Props {
  era: Era;
  taken: readonly string[];
  onBack: () => void;
  /** The third argument is optional for existing callers while they migrate. */
  onCreate: (name: string, displayName: string, setup: SetupOptions) => void;
  /** Opens this screen in the simulation mode, which does not create a character. */
  initialWorldsim?: boolean;
  /** Controlled anonymous statistics consent, when the parent has settings available. */
  shareStatistics?: boolean;
  onStatisticsChange?: (share: boolean) => void;
}

const AUTONOMY_OPTIONS: readonly { value: SetupAutonomy; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "Countries follow authored rules only." },
  { value: "v0", label: "V0", description: "Light autonomous political activity." },
  { value: "v1", label: "V1", description: "Measured autonomous political activity." },
  { value: "v2", label: "V2", description: "Active autonomous political activity." },
  { value: "v3", label: "V3", description: "Strong autonomous political activity." },
  { value: "v4", label: "V4", description: "Full autonomous political activity." },
];

const DIFFICULTIES: readonly { value: SetupDifficulty; label: string; description: string }[] = [
  { value: "easy", label: "Easy", description: "More forgiving conditions while you learn." },
  { value: "normal", label: "Normal", description: "The intended balance for a first campaign." },
  { value: "hard", label: "Hard", description: "Tighter conditions and less room for error." },
];

/** Configure a world. Character creation happens in the game after the server starts. */
export function NewWorldScreen({
  era,
  taken,
  onBack,
  onCreate,
  initialWorldsim = false,
  shareStatistics,
  onStatisticsChange,
}: Props): JSX.Element {
  const [name, setName] = useState(`${era.subtitle}, ${era.label}`);
  const [savedSetup] = useState(readSetupOptions);
  const [mode, setMode] = useState<SetupMode>(initialWorldsim ? "worldsim" : savedSetup.mode);
  const [difficulty, setDifficulty] = useState<SetupDifficulty>(savedSetup.difficulty);
  const [autonomyLevel, setAutonomyLevel] = useState<SetupAutonomy>(savedSetup.autonomyLevel);
  const [featureFlags, setFeatureFlags] = useState<Record<FeatureFlagKey, boolean>>(savedSetup.featureFlags);
  const [localShareStatistics, setLocalShareStatistics] = useState(true);
  const duplicate = taken.some((existing) => existing.trim().toLowerCase() === name.trim().toLowerCase());
  const theme = themeForEra(era.id);
  const sharing = shareStatistics ?? localShareStatistics;
  const worldsim = mode === "worldsim";

  useEffect(() => {
    writeSetupOptions({ mode, difficulty, autonomyLevel, featureFlags });
  }, [mode, difficulty, autonomyLevel, featureFlags]);

  const changeStatistics = (next: boolean) => {
    setLocalShareStatistics(next);
    onStatisticsChange?.(next);
  };

  const featureGroups = ["World systems", "Politics", "Economy", "Player systems"] as const;
  const featureControl = (option: (typeof FEATURE_OPTIONS)[number]) => (
    <label className="screen-feature" key={option.key}>
      <input
        type="checkbox"
        checked={featureFlags[option.key]}
        onChange={(event) => setFeatureFlags((current) => ({ ...current, [option.key]: event.target.checked }))}
      />
      <span><strong>{option.label}</strong><small>{option.description}</small></span>
    </label>
  );

  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true"><div className="launcher-nebula" /></div>
      <section className="launcher-stage screen-stage" aria-labelledby="new-world-title">
        <header className="screen-head">
          <button className="launcher-btn launcher-btn-secondary screen-back" onClick={onBack}>
            <span aria-hidden="true">&#8592;</span> Back
          </button>
          <h1 id="new-world-title">New world <span className="client-beta">Beta</span></h1>
        </header>

        <div className="launcher-console screen-console">
          <div className="screen-era" style={{ borderColor: theme.phosphor }}>
            <span className="launcher-era-swatch" style={{ backgroundColor: theme.phosphor }} aria-hidden="true" />
            <div><strong>{era.label}</strong><small>{era.subtitle} · begins {era.startDate}</small></div>
          </div>

          <label className="screen-field">
            <span>World name</span>
            <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} autoFocus />
            {duplicate && <em>You already have a world with this name. It will get a numbered folder.</em>}
          </label>

          <fieldset className="screen-choice-group">
            <legend>Play mode</legend>
            <label><input type="radio" name="play-mode" value="normal" checked={mode === "normal"} onChange={() => setMode("normal")} /> <strong>Normal player</strong><small>Make choices through a character in the world.</small></label>
            <label><input type="radio" name="play-mode" value="head-of-state" checked={mode === "head-of-state"} onChange={() => setMode("head-of-state")} /> <strong>Permanent head of state</strong><small>Remain in the head-of-state role throughout the campaign.</small></label>
            <label><input type="radio" name="play-mode" value="worldsim" checked={worldsim} onChange={() => setMode("worldsim")} /> <strong>Worldsim <span className="client-beta">Beta</span></strong><small>Simulate the world without creating a character.</small></label>
          </fieldset>

          <label className="screen-field"><span>Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as SetupDifficulty)}>{DIFFICULTIES.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.description}</option>)}</select></label>
          <label className="screen-field"><span>Autonomy</span><select value={autonomyLevel} onChange={(event) => setAutonomyLevel(event.target.value as SetupAutonomy)}>{AUTONOMY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.description}</option>)}</select></label>

          <section className="screen-features" aria-labelledby="feature-settings-title">
            <h2 id="feature-settings-title">World settings</h2>
            {featureGroups.map((category) => (
              <fieldset key={category} className="screen-feature-group">
                <legend>{category}</legend>
                {FEATURE_OPTIONS.filter((option) => option.category === category).map(featureControl)}
              </fieldset>
            ))}
            <details>
              <summary>Advanced world settings</summary>
              <div className="screen-feature-list">{FEATURE_OPTIONS.filter((option) => option.category === "Advanced world settings").map(featureControl)}</div>
            </details>
          </section>

          <label className="screen-consent">
            <input type="checkbox" checked={sharing} onChange={(event) => changeStatistics(event.target.checked)} />
            <span><strong>Share anonymous setup statistics</strong><small>Help improve balance with anonymous, aggregate data. You can opt out at any time.</small></span>
          </label>

          <p className="launcher-caption">{worldsim ? "This mode opens the world simulator after setup and does not create a character." : "Character creation happens in the game after the world starts."} Building a world seeds thirty countries and takes about a minute.</p>
          <div className="launcher-actions">
            <button className="launcher-btn launcher-btn-primary" onClick={() => onCreate(name, "", { mode, difficulty, autonomyLevel, featureFlags })} disabled={!name.trim()}>Create and play <span aria-hidden="true">&#8594;</span></button>
          </div>
        </div>
      </section>
    </main>
  );
}
