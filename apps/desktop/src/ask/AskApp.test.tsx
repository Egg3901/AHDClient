/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  askMe: vi.fn(),
  askConversations: vi.fn(),
  askConversation: vi.fn(),
  askSend: vi.fn(),
  askStop: vi.fn(),
  askOpen: vi.fn(),
  streamHandler: null as null | ((event: { reqId: string; kind: string; data: unknown }) => void),
}));

vi.mock("./api.js", () => ({
  askMe: (...args: unknown[]) => mocks.askMe(...args),
  askConversations: (...args: unknown[]) => mocks.askConversations(...args),
  askConversation: (...args: unknown[]) => mocks.askConversation(...args),
  askSend: (...args: unknown[]) => mocks.askSend(...args),
  askStop: (...args: unknown[]) => mocks.askStop(...args),
  askRenderMap: vi.fn(async () => "<svg></svg>"),
  onAskStream: (handler: (event: { reqId: string; kind: string; data: unknown }) => void) => {
    mocks.streamHandler = handler;
    return Promise.resolve(() => {});
  },
  quotaLabel: (usage: { remaining: number; limit: number } | null) =>
    usage ? `${usage.remaining} of ${usage.limit} left` : "",
  resetIn: () => "38m",
  usageIn: (value: unknown) =>
    value && typeof value === "object" && "usage" in value
      ? ((value as { usage?: unknown }).usage ?? null)
      : null,
  isSignedOutError: (error: unknown) =>
    !!(
      (error && typeof error === "object" && "signedOut" in error && (error as { signedOut?: unknown }).signedOut === true) ||
      (typeof error === "string" && /sign in/i.test(error))
    ),
  usageFromError: (error: unknown) =>
    error && typeof error === "object" && "usage" in error ? (error as { usage?: unknown }).usage ?? null : null,
  AskError: class AskError extends Error {},
}));

vi.mock("../worlds.js", () => ({ ask: { open: mocks.askOpen } }));

import { AskApp } from "./AskApp.js";
import { ASK_SESSION_CACHE_KEY } from "./session.js";
import { saveCachedAskSession } from "./session.js";

const baseUsage = {
  used: 3,
  limit: 10,
  remaining: 7,
  mcpUsed: 0,
  mcpLimit: 2,
  mcpRemaining: 2,
  resetAt: Date.now() + 3600_000,
};

const me = (username: string, usage: unknown) => ({
  identity: { username },
  entitlement: { allowed: true, label: "Player" },
  usage,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  mocks.streamHandler = null;
  mocks.askMe.mockReset().mockResolvedValue(me("marshall", baseUsage));
  mocks.askConversations.mockReset().mockResolvedValue({ conversations: [], usage: null });
  mocks.askConversation.mockReset().mockResolvedValue([]);
  mocks.askSend.mockReset().mockResolvedValue("req-1");
  mocks.askStop.mockReset().mockResolvedValue(undefined);
  mocks.askOpen.mockReset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ask startup", () => {
  it("paints the usable shell immediately from cache while /api/me is still pending", async () => {
    saveCachedAskSession({ username: "marshall", usage: baseUsage, tier: "Player" });
    const gate = deferred<unknown>();
    mocks.askMe.mockReturnValue(gate.promise);

    render(<AskApp />);

    // Shell is usable before the authoritative refresh answers.
    expect(screen.getByText("7 of 10 left", { exact: false })).toBeTruthy();
    expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.queryByText("Opening your questions…")).toBeNull();

    gate.resolve(me("marshall", { ...baseUsage, used: 4, remaining: 6 }));
    await waitFor(() => expect(screen.getByText("6 of 10 left", { exact: false })).toBeTruthy());
  });

  it("shows an explicit checking shell instead of a blocked panel on first launch", async () => {
    const gate = deferred<unknown>();
    mocks.askMe.mockReturnValue(gate.promise);

    render(<AskApp />);

    expect(screen.queryByText("Opening your questions…")).toBeNull();
    expect(screen.getByText("Checking access…")).toBeTruthy();
    expect(screen.getByLabelText("Ask a question")).toBeTruthy();
    expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(true);

    gate.resolve(me("marshall", baseUsage));
    await waitFor(() =>
      expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false),
    );
    expect(screen.getByText("7 of 10 left", { exact: false })).toBeTruthy();
  });

  it("signs out and clears cached quota on 401", async () => {
    saveCachedAskSession({ username: "marshall", usage: baseUsage, tier: "Player" });
    mocks.askMe.mockRejectedValue({ signedOut: true, message: "Please sign in to Ask first." });

    render(<AskApp />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
    expect(localStorage.getItem(ASK_SESSION_CACHE_KEY)).toBeNull();
  });

  it("replaces cached quota when the account changes", async () => {
    saveCachedAskSession({ username: "marshall", usage: baseUsage, tier: "Player" });
    const other = { ...baseUsage, used: 9, remaining: 1 };
    mocks.askMe.mockResolvedValue(me("delegate", other));

    render(<AskApp />);

    await waitFor(() => expect(screen.getByText("1 of 10 left", { exact: false })).toBeTruthy());
    expect(screen.queryByText("7 of 10 left", { exact: false })).toBeNull();
    expect(JSON.parse(localStorage.getItem(ASK_SESSION_CACHE_KEY) ?? "{}").username).toBe("delegate");
  });

  it("drops the previous account's open thread when the account changes", async () => {
    saveCachedAskSession({ username: "marshall", usage: baseUsage, tier: "Player" });
    localStorage.setItem("ahdclient.ask.conv", "c1");
    mocks.askConversations.mockResolvedValue({ conversations: [{ id: "c1", title: "Harvest" }], usage: null });
    mocks.askConversation.mockResolvedValue([{ question: "Why did the harvest fail?", answer: "Blight." }]);

    render(<AskApp />);
    await waitFor(() => expect(screen.getByText("Why did the harvest fail?")).toBeTruthy());

    const other = { ...baseUsage, used: 9, remaining: 1 };
    mocks.askMe.mockResolvedValue(me("delegate", other));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByText("1 of 10 left", { exact: false })).toBeTruthy());
    expect(screen.queryByText("Why did the harvest fail?")).toBeNull();
    expect(localStorage.getItem("ahdclient.ask.conv")).toBeNull();
  });
});

describe("ask quota updates", () => {
  it("updates quota from the answer event", async () => {
    render(<AskApp />);
    await waitFor(() =>
      expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false),
    );

    const answered = { ...baseUsage, used: 4, remaining: 6 };
    const refresh = deferred<unknown>();
    mocks.askMe.mockReturnValue(refresh.promise);

    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "Why did the harvest fail?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(mocks.askSend).toHaveBeenCalled());

    mocks.streamHandler?.({
      reqId: "req-1",
      kind: "done",
      data: { answer: "Blight.", usage: answered },
    });
    await waitFor(() => expect(screen.getByText("6 of 10 left", { exact: false })).toBeTruthy());

    refresh.resolve(me("marshall", answered));
    await waitFor(() => expect(screen.getByText("6 of 10 left", { exact: false })).toBeTruthy());
  });

  it("updates quota on a 429 answer refusal", async () => {
    render(<AskApp />);
    await waitFor(() =>
      expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false),
    );

    const spent = { ...baseUsage, used: 10, remaining: 0 };
    const refresh = deferred<unknown>();
    mocks.askMe.mockReturnValue(refresh.promise);

    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "One more question?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(mocks.askSend).toHaveBeenCalled());

    mocks.streamHandler?.({
      reqId: "req-1",
      kind: "final",
      data: { status: 429, body: JSON.stringify({ error: "No questions left", usage: spent }) },
    });
    await waitFor(() => expect(screen.getByText("0 of 10 left", { exact: false })).toBeTruthy());

    refresh.resolve(me("marshall", spent));
  });
});
