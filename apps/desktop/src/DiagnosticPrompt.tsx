import type { DiagnosticReason } from "./diagnostics";

interface Props {
  incident: { reason: DiagnosticReason; message: string } | null;
  sending: boolean;
  onDismiss: () => void;
  onSend: () => void;
}

export function DiagnosticPrompt({ incident, sending, onDismiss, onSend }: Props): JSX.Element | null {
  if (!incident) return null;
  return <div className="client-settings-backdrop" role="presentation">
    <section className="client-diagnostic-dialog" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title">
      <span className="client-settings-kicker">Local game diagnostics</span>
      <h2 id="diagnostic-title">Report this problem?</h2>
      <p>{incident.message}</p>
      <small>Sends the client version, failure type, timestamp, and up to 60 redacted startup log lines. It never sends your save, account details, character name, or Windows username.</small>
      <div><button className="secondary" type="button" disabled={sending} onClick={onDismiss}>Not now</button><button type="button" disabled={sending} onClick={onSend}>{sending ? "Sending…" : "Send diagnostics"}</button></div>
    </section>
  </div>;
}
