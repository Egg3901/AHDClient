interface Props {
  title: string;
  lines: string[];
  onCancel: () => void;
}

/** Shown while the local server (and on first run, MongoDB) comes up. */
export function BootScreen({ title, lines, onCancel }: Props): JSX.Element {
  return (
    <main className="launcher-scope screen-scope">
      <div className="launcher-pattern" aria-hidden="true">
        <div className="launcher-nebula" />
      </div>
      <section className="launcher-stage screen-stage" aria-labelledby="boot-title" aria-busy="true">
        <header className="screen-head">
          <span className="screen-spinner" aria-hidden="true" />
          <h1 id="boot-title">{title}</h1>
        </header>
        <div className="launcher-console screen-console">
          <pre className="screen-log" aria-live="polite">
            {lines.length === 0 ? "Starting the game server" : lines.join("\n")}
          </pre>
          <div className="launcher-actions">
            <button className="launcher-btn launcher-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
