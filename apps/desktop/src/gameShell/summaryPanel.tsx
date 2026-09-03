import type { SummaryModel } from "./summaries.js";

/**
 * Transport-free rendering of a SummaryModel. Reads the passed model only:
 * no fetch, no Tauri, no world access. Every manifest summary route stays
 * clickable through the shell nav; this panel is the click target.
 */
export function RouteSummaryPanel({
  model,
  reason,
}: {
  model: SummaryModel;
  reason: string | undefined;
}) {
  return (
    <div className="panel gs-panel">
      <h1 className="gs-panel-title">{model.title}</h1>
      <p className="muted small">
        Served from the on-device world. No fetch, no account.
      </p>
      <p className="muted">{model.lede}</p>
      {reason !== undefined ? (
        <p className="muted small">{reason}</p>
      ) : null}
      {model.notice !== null ? (
        <p className="muted small">{model.notice}</p>
      ) : null}
      <dl className="gs-facts">
        {model.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {model.lists.map((list) => (
        <section key={list.heading} aria-label={list.heading}>
          <h2 className="gs-drawer-section">{list.heading}</h2>
          {list.items.length === 0 ? (
            <p className="muted small">None on file.</p>
          ) : (
            <ul className="gs-picker-list">
              {list.items.map((item) => (
                <li key={item} className="muted small">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="muted small">
        This summary is projected directly from the live local record.
      </p>
    </div>
  );
}
