/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api.js")>();
  return { ...actual, askRenderMap: vi.fn(async () => "<svg></svg>") };
});

import { Md } from "./markdown.js";

describe("answer markdown", () => {
  it("shapes headings, bold, italic, and inline code", () => {
    render(<Md text={"## Supply lines\n\nMove **fast** but *quietly* with `scouts`."} scope="t1" />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Supply lines");
    expect(screen.getByText("fast").tagName).toBe("STRONG");
    expect(screen.getByText("quietly").tagName).toBe("EM");
    expect(screen.getByText("scouts").tagName).toBe("CODE");
  });

  it("links only http addresses and drops the rest as text", () => {
    render(<Md text={"See [the rules](https://example.com/rules) or [nope](javascript:alert(1))."} scope="t2" />);
    const link = screen.getByRole("link", { name: "the rules" });
    expect(link.getAttribute("href")).toBe("https://example.com/rules");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("link", { name: "nope" })).toBeNull();
  });

  it("renders script payloads as inert text, never elements", () => {
    const view = render(<Md text={"Hello <script>alert(1)</script> world."} scope="t3" />);
    expect(document.querySelector("script")).toBeNull();
    expect(view.container.textContent).toContain("<script>alert(1)</script>");
  });

  it("builds lists and tables with shaped numbers", () => {
    render(
      <Md
        text={"- first\n- second\n\n| State | Debt |\n|---|---|\n| Ohio | 1250000 |\n| Maine | +4.2% |"}
        scope="t4"
      />,
    );
    expect(screen.getByText("first").closest("li")).toBeTruthy();
    expect(screen.getByText("1,250,000").closest("td")).toBeTruthy();
    expect(screen.getByText("▲ +4.2%").closest("td")).toBeTruthy();
  });

  it("keeps code fences literal and renders map fences through the service", async () => {
    render(<Md text={"```js\nconst x = 1;\n```\n\n```ahd-map\n{\"kind\":\"map\"}\n```"} scope="t5" />);
    expect(screen.getByText(/const x = 1/)).toBeTruthy();
    await waitFor(() => {
      const map = screen.getByRole("img", { name: "Generated map" });
      expect(map.getAttribute("src")).toContain("data:image/svg+xml");
      expect(document.querySelector(".av-map-wrap svg")).toBeNull();
    });
  });

  it("renders quotes without leaking markup", () => {
    render(<Md text={"> Stay **calm**.\n> Hold the line."} scope="t6" />);
    expect(screen.getByText("calm").tagName).toBe("STRONG");
  });
});
