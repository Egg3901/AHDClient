import { describe, expect, it } from "vitest";
import { getCatalog, getLaw } from "./index.js";

describe("engine public API", () => {
  it("exposes the legislation catalog used by desktop Congress", () => {
    expect(getCatalog("US")).toBeDefined();
    expect(getLaw("us.tax.incomeTax")?.id).toBe("us.tax.incomeTax");
  });
});
