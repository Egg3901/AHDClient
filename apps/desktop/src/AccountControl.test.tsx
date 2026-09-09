/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AccountControl } from "./AccountControl.js";

const handlers = { onLink: vi.fn(), onProfile: vi.fn(), onManage: vi.fn() };

describe("AccountControl", () => {
  afterEach(cleanup);

  it("shows a bounded picture for a trusted avatar URL", () => {
    render(
      <AccountControl
        checked
        linked
        displayName="Ada Lovelace"
        avatarUrl="https://ahousedividedgame.com/avatars/a.png"
        supporter
        {...handlers}
      />,
    );
    const img = document.querySelector("img.client-account-avatar");
    expect(img?.getAttribute("src")).toBe("https://ahousedividedgame.com/avatars/a.png");
    expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2);
  });

  it("falls back to an initial when the avatar URL is untrusted or absent", () => {
    const { rerender } = render(
      <AccountControl checked linked displayName="Ada Lovelace" avatarUrl="https://evil.com/a.png" supporter={false} {...handlers} />,
    );
    expect(document.querySelector("img.client-account-avatar")).toBeNull();
    expect(document.querySelector(".client-account-avatar")?.textContent).toBe("AL");
    rerender(
      <AccountControl checked linked displayName="Ada Lovelace" supporter={false} {...handlers} />,
    );
    expect(document.querySelector("img.client-account-avatar")).toBeNull();
  });
});
