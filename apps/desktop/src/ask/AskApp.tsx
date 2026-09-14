import { useCallback, useEffect, useRef, useState } from "react";
import {
  askConversation,
  askConversations,
  askMe,
  askSend,
  askStop,
  onAskStream,
  quotaLabel,
  resetIn,
  type AskAnswer,
  type AskConversation,
  type AskStreamEvent,
  type AskTurn,
  type AskUsage,
} from "./api.js";
import { ask } from "../worlds.js";
import { Md } from "./markdown.js";
import "./ask.css";

type Phase = "checking" | "signedOut" | "ready";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  status?: string | undefined;
  trail?: number;
  result?: AskAnswer;
  error?: string;
  stopped?: boolean;
}

const CONV_KEY = "ahdclient.ask.conv";
const LIVE_KEY = "ahdclient.ask.live";

let msgSeq = 0;
function nextId(prefix: string): string {
  msgSeq += 1;
  return `${prefix}-${Date.now()}-${msgSeq}`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function answerOf(data: unknown): AskAnswer | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.answer !== "string") return null;
  const answer: AskAnswer = {
    answer: record.answer,
    areas: Array.isArray(record.areas) ? record.areas : [],
    citations: Array.isArray(record.citations) ? record.citations : [],
    followups: Array.isArray(record.followups) ? (record.followups as string[]) : [],
    cached: record.cached === true,
    usedMcp: record.usedMcp === true,
    liveSources: Array.isArray(record.liveSources) ? record.liveSources : [],
    liveHint: str(record.liveHint) ?? null,
    vizBlocked: record.vizBlocked === true,
    usage: (record.usage as AskUsage | null) ?? null,
  };
  const reportUrl = str(record.reportUrl);
  if (reportUrl !== undefined) answer.reportUrl = reportUrl;
  const followupsLeft = record.followupsLeft;
  if (typeof followupsLeft === "number") answer.followupsLeft = followupsLeft;
  const model = str(record.model);
  if (model !== undefined) answer.model = model;
  const modelName = str(record.modelName);
  if (modelName !== undefined) answer.modelName = modelName;
  const convId = str(record.convId);
  if (convId !== undefined) answer.convId = convId;
  return answer;
}

function turnToMsgs(turn: AskTurn, scope: string): Msg[] {
  const out: Msg[] = [{ id: nextId(`${scope}-q`), role: "user", text: turn.question }];
  const result = answerOf(turn);
  out.push({
    id: nextId(`${scope}-a`),
    role: "assistant",
    text: turn.answer,
    ...(result ? { result } : {}),
  });
  return out;
}

export function AskApp(): JSX.Element {
  const [phase, setPhase] = useState<Phase>("checking");
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [convs, setConvs] = useState<AskConversation[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [activeReq, setActiveReq] = useState<string | null>(null);
  const [fuLeft, setFuLeft] = useState<number | null>(null);
  const [useMcp, setUseMcp] = useState(() => {
    try {
      return localStorage.getItem(LIVE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeReqRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  activeReqRef.current = activeReq;

  const patchAssistant = useCallback((reqId: string, patch: (msg: Msg) => Msg) => {
    setMsgs((prev) => prev.map((msg) => (msg.id === `a-${reqId}` ? patch(msg) : msg)));
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const me = await askMe();
      if (me.usage) setUsage(me.usage);
      setTier(me.entitlement?.label ?? null);
    } catch {
      // Quota is best-effort; the thread already carries its own usage.
    }
  }, []);

  const refreshConvs = useCallback(async () => {
    try {
      const { conversations, usage: listUsage } = await askConversations();
      setConvs(conversations);
      if (listUsage) setUsage(listUsage);
    } catch {
      // History is best-effort once the thread is showing.
    }
  }, []);

  const openThread = useCallback(
    async (id: string | null) => {
      setConvId(id);
      setFuLeft(null);
      try {
        if (id) localStorage.setItem(CONV_KEY, id);
        else localStorage.removeItem(CONV_KEY);
      } catch {
        // Private browsing: the thread still works for this session.
      }
      if (!id) {
        setMsgs([]);
        return;
      }
      try {
        const turns = await askConversation(id);
        setMsgs(turns.flatMap((turn, i) => turnToMsgs(turn, `h${i}`)));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not load that conversation.");
      }
    },
    [],
  );

  const probe = useCallback(async () => {
    setPhase((prev) => (prev === "ready" ? prev : "checking"));
    try {
      const me = await askMe();
      if (me.usage) setUsage(me.usage);
      setTier(me.entitlement?.label ?? null);
      const { conversations, usage: listUsage } = await askConversations();
      setConvs(conversations);
      if (listUsage) setUsage(listUsage);
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(CONV_KEY);
      } catch {
        stored = null;
      }
      const resume = stored && conversations.some((conv) => conv.id === stored) ? stored : null;
      setPhase("ready");
      await openThread(resume);
    } catch (error) {
      if (error && typeof error === "object" && "signedOut" in error && (error as { signedOut?: boolean }).signedOut) {
        setPhase("signedOut");
      } else {
        setNotice(error instanceof Error ? error.message : "Could not reach Ask.");
        setPhase("ready");
      }
    }
  }, [openThread]);

  useEffect(() => {
    void probe();
  }, [probe]);

  // The sign-in window closes itself on login and focuses this panel, so
  // re-probe whenever it regains focus while signed out.
  useEffect(() => {
    const onFocus = () => {
      setPhase((prev) => {
        if (prev === "signedOut") void probe();
        return prev;
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [probe]);

  // Answer stream routing. One question at a time: the composer locks while
  // a stream is live, so the ref always names the visible placeholder.
  useEffect(() => {
    let live = true;
    const finish = () => {
      if (!live) return;
      setActiveReq(null);
      void refreshQuota();
      void refreshConvs();
    };
    void onAskStream((event: AskStreamEvent) => {
      if (!live || event.reqId !== activeReqRef.current) return;
      const data = event.data as Record<string, unknown>;
      switch (event.kind) {
        case "meta": {
          const conv = typeof data.convId === "string" ? data.convId : null;
          if (typeof data.followupsLeft === "number") setFuLeft(data.followupsLeft);
          if (conv) {
            setConvId((prev) => {
              if (prev !== conv) {
                try {
                  localStorage.setItem(CONV_KEY, conv);
                } catch {
                  // Ignore.
                }
              }
              return conv;
            });
          }
          break;
        }
        case "status":
          patchAssistant(event.reqId, (msg) => ({
            ...msg,
            status: typeof data.label === "string" ? data.label : "Thinking…",
          }));
          break;
        case "action":
          patchAssistant(event.reqId, (msg) => ({ ...msg, trail: (msg.trail ?? 0) + 1 }));
          break;
        case "delta":
          if (typeof data === "string") {
            patchAssistant(event.reqId, (msg) => ({ ...msg, text: msg.text + data }));
          }
          break;
        case "done": {
          const answer = answerOf(data);
          if (answer) {
            if (answer.convId) {
              try {
                localStorage.setItem(CONV_KEY, answer.convId);
              } catch {
                // Ignore.
              }
              setConvId(answer.convId);
            }
            if (typeof answer.followupsLeft === "number") setFuLeft(answer.followupsLeft);
            if (answer.usage) setUsage(answer.usage);
            patchAssistant(event.reqId, (msg) => ({
              ...msg,
              text: answer.answer,
              streaming: false,
              status: undefined,
              result: answer,
            }));
          }
          finish();
          break;
        }
        case "final": {
          const status = typeof data.status === "number" ? data.status : 0;
          let body: unknown = null;
          try {
            body = typeof data.body === "string" ? JSON.parse(data.body) : null;
          } catch {
            body = null;
          }
          if (status >= 200 && status < 300) {
            const answer = answerOf(body);
            if (answer) {
              if (answer.convId) setConvId(answer.convId);
              if (answer.usage) setUsage(answer.usage);
              patchAssistant(event.reqId, (msg) => ({
                ...msg,
                text: answer.answer,
                streaming: false,
                status: undefined,
                result: answer,
              }));
            } else {
              patchAssistant(event.reqId, (msg) => ({
                ...msg,
                streaming: false,
                status: undefined,
                error: "That answer came back in a shape this panel does not understand yet.",
              }));
            }
          } else if (status === 401) {
            setPhase("signedOut");
            patchAssistant(event.reqId, (msg) => ({ ...msg, streaming: false, status: undefined }));
          } else {
            const message =
              body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
                ? String((body as { error?: unknown }).error)
                : "Something went wrong. Try again.";
            patchAssistant(event.reqId, (msg) => ({
              ...msg,
              streaming: false,
              status: undefined,
              error: message,
            }));
          }
          finish();
          break;
        }
        case "error":
          patchAssistant(event.reqId, (msg) => ({
            ...msg,
            streaming: false,
            status: undefined,
            error:
              data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
                ? String((data as { error?: unknown }).error)
                : "Something went wrong. Try again.",
          }));
          finish();
          break;
        case "stopped":
          patchAssistant(event.reqId, (msg) => ({ ...msg, streaming: false, status: undefined, stopped: true }));
          finish();
          break;
        default:
          break;
      }
    }).then(
      () => undefined,
      () => setNotice("Live answers are unavailable in this window. Reopen the panel and try again."),
    );
    return () => {
      live = false;
    };
    // finish/refresh closures are stable single-purpose callbacks for this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchAssistant, refreshConvs, refreshQuota]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && stickRef.current) node.scrollTop = node.scrollHeight;
  }, [msgs]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || activeReqRef.current) return;
      setNotice(null);
      const userMsg: Msg = { id: nextId("q"), role: "user", text: question };
      const reqKey = nextId("rid");
      const assistant: Msg = {
        id: `a-${reqKey}`,
        role: "assistant",
        text: "",
        streaming: true,
        status: "Thinking…",
      };
      setMsgs((prev) => [...prev, userMsg, assistant]);
      setInput("");
      try {
        const reqId = await askSend(question, convId, useMcp);
        // Re-key the placeholder onto the real request id the stream uses.
        setMsgs((prev) => prev.map((msg) => (msg.id === assistant.id ? { ...msg, id: `a-${reqId}` } : msg)));
        setActiveReq(reqId);
      } catch (error) {
        setMsgs((prev) => prev.filter((msg) => msg.id !== assistant.id));
        if (error && typeof error === "object" && "signedOut" in error && (error as { signedOut?: boolean }).signedOut) {
          setPhase("signedOut");
        } else {
          setNotice(error instanceof Error ? error.message : "Could not send that question.");
        }
      }
    },
    [convId, useMcp],
  );

  const stop = useCallback(async () => {
    const reqId = activeReqRef.current;
    if (!reqId) return;
    try {
      await askStop(reqId);
    } catch {
      // The pump still exits on its own; the button did its job.
    }
  }, []);

  const costLabel = fuLeft === null ? "Ask…" : fuLeft > 0 ? `Follow-up · ½ question · ${fuLeft} left` : "1 question · follow-ups used up";

  if (phase === "checking") {
    return (
      <div className="askview">
        <div className="av-center">
          <div className="av-brand">Ask</div>
          <p className="av-muted">Opening your questions…</p>
        </div>
      </div>
    );
  }

  if (phase === "signedOut") {
    return (
      <div className="askview">
        <div className="av-center">
          <div className="av-brand">Ask</div>
          <p className="av-muted">Sign in with your game account to ask questions. Players already signed in skip the password prompt.</p>
          <button type="button" className="av-primary" onClick={() => void ask.open().catch(() => undefined)}>
            Sign in
          </button>
          <button type="button" className="av-quiet" onClick={() => void probe()}>
            I signed in — retry
          </button>
          {notice ? <p className="av-error">{notice}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="askview">
      <header className="av-head">
        <div className="av-brand">Ask</div>
        <div className="av-head-actions">
          {usage ? (
            <span className="av-quota" title={tier ? `Plan: ${tier}. Allowance resets in ${resetIn(usage.resetAt)}.` : `Allowance resets in ${resetIn(usage.resetAt)}.`}>
              {quotaLabel(usage)}
            </span>
          ) : null}
          <button type="button" className="av-iconbtn" aria-label="New chat" title="New chat" onClick={() => void openThread(null)}>
            +
          </button>
          <button
            type="button"
            className="av-iconbtn"
            aria-label="Chat history"
            title="Chat history"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            ☰
          </button>
        </div>
      </header>

      {usage ? (
        <div className="av-quota-strip" aria-label="Question allowance">
          <div className="av-meter">
            <div className="av-meter-row">
              <span>Questions</span>
              <span>{usage.remaining}/{usage.limit}</span>
            </div>
            <div className="av-bar"><i style={{ width: `${usage.limit ? Math.round((100 * usage.remaining) / usage.limit) : 0}%` }} /></div>
          </div>
          <div className="av-meter">
            <div className="av-meter-row">
              <span>Live data</span>
              <span>{usage.mcpRemaining}/{usage.mcpLimit}</span>
            </div>
            <div className="av-bar"><i style={{ width: `${usage.mcpLimit ? Math.round((100 * usage.mcpRemaining) / usage.mcpLimit) : 0}%` }} /></div>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <div className="av-history" role="dialog" aria-label="Chat history">
          {convs.length === 0 ? <p className="av-muted">No conversations yet.</p> : null}
          {convs.map((conv) => (
            <button
              key={conv.id}
              type="button"
              className={conv.id === convId ? "av-conv active" : "av-conv"}
              onClick={() => {
                setShowHistory(false);
                void openThread(conv.id);
              }}
            >
              {conv.title || "Untitled conversation"}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="av-thread"
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        {msgs.length === 0 ? (
          <div className="av-center">
            <p className="av-muted">Ask about any part of the game — rules, strategy, your character, the wider world.</p>
          </div>
        ) : null}
        {msgs.map((msg) =>
          msg.role === "user" ? (
            <div className="av-turn" key={msg.id}>
              <div className="av-q"><p className="av-qt">{msg.text}</p></div>
            </div>
          ) : (
            <AssistantMsg key={msg.id} msg={msg} onFollowup={(text) => void send(text)} />
          ),
        )}
      </div>

      {notice ? <p className="av-error" role="alert">{notice}</p> : null}

      <footer className="av-composer">
        <label className="av-live">
          <input
            type="checkbox"
            checked={useMcp}
            onChange={(event) => {
              const checked = event.target.checked;
              setUseMcp(checked);
              try {
                localStorage.setItem(LIVE_KEY, checked ? "on" : "off");
              } catch {
                // Ignore.
              }
            }}
          />
          <span>Use live game data</span>
        </label>
        <div className="av-row">
          <textarea
            value={input}
            rows={2}
            placeholder="Ask a question…"
            aria-label="Ask a question"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          {activeReq ? (
            <button type="button" className="av-stop" aria-label="Stop" title="Stop" onClick={() => void stop()}>
              ■
            </button>
          ) : (
            <button type="button" className="av-send" disabled={!input.trim()} onClick={() => void send(input)}>
              Ask
            </button>
          )}
        </div>
        <div className="av-cost">{costLabel}</div>
      </footer>
    </div>
  );
}

function AssistantMsg({ msg, onFollowup }: { msg: Msg; onFollowup: (text: string) => void }): JSX.Element {
  const result = msg.result;
  const citations = result?.citations ?? [];
  const followups = result?.followups ?? [];
  const liveSources = result?.liveSources ?? [];
  return (
    <div className="av-turn">
      <div className="av-ans-head">
        <span className="av-ans-label">Answer</span>
        {result?.modelName ? <span className="av-flag">{result.modelName}</span> : null}
        {result?.cached ? <span className="av-flag">cached</span> : null}
        {msg.stopped ? <span className="av-flag">stopped</span> : null}
      </div>
      {msg.error ? (
        <p className="av-error">{msg.error}</p>
      ) : msg.text ? (
        <div className="av-answer"><Md text={msg.text} scope={msg.id} /></div>
      ) : (
        <p className="av-muted">{msg.status ?? "Thinking…"}{msg.trail ? ` · ${msg.trail} checks` : ""}</p>
      )}
      {msg.streaming && msg.text ? <p className="av-muted">{msg.status ?? "Writing…"}</p> : null}
      {result?.vizBlocked ? (
        <p className="av-note">Visualizations are used up for today, so this answer comes without them.</p>
      ) : null}
      {liveSources.length > 0 ? (
        <p className="av-live-src">Live: {liveSources.map((source) => source.label).join(" · ")}</p>
      ) : null}
      {citations.length > 0 ? (
        <details className="av-srcs">
          <summary>Sources · {citations.length}</summary>
          <ol>
            {citations.map((citation, i) => (
              <li key={i}>
                {citation.url ? (
                  <a href={citation.url} target="_blank" rel="noopener">{citation.label || citation.path || citation.url}</a>
                ) : (
                  citation.label || citation.path || "Source"
                )}
                {citation.url && citation.path ? <span className="av-src-path">{citation.path}</span> : null}
                {!citation.url && citation.path && citation.label ? <span className="av-src-path">{citation.path}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {followups.length > 0 && !msg.streaming ? (
        <div className="av-sugg">
          {followups.map((followup, i) => (
            <button key={i} type="button" onClick={() => onFollowup(followup)}>
              {followup}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
