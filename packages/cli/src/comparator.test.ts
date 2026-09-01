import { describe, expect, it } from "vitest";
import { deepCompare, formatDiffs } from "./comparator.js";

describe("deepCompare", () => {
  it("reports equal for identical primitives", () => {
    expect(deepCompare(42, 42).equal).toBe(true);
    expect(deepCompare("hello", "hello").equal).toBe(true);
    expect(deepCompare(null, null).equal).toBe(true);
  });

  it("reports not equal for different primitives", () => {
    const r = deepCompare(1, 2);
    expect(r.equal).toBe(false);
    expect(r.diffs.length).toBe(1);
    expect(r.diffs[0]!.path).toBe("(root)");
  });

  it("compares objects deeply", () => {
    const a = { x: 1, y: { z: 2 } };
    const b = { x: 1, y: { z: 2 } };
    expect(deepCompare(a, b).equal).toBe(true);
  });

  it("detects nested diff with path", () => {
    const a = { x: 1, y: { z: 2 } };
    const b = { x: 1, y: { z: 3 } };
    const r = deepCompare(a, b);
    expect(r.equal).toBe(false);
    expect(r.diffs.some((d) => d.path === "y.z")).toBe(true);
  });

  it("detects missing keys", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 1 };
    const r = deepCompare(a, b);
    expect(r.equal).toBe(false);
    expect(r.diffs.some((d) => d.path === "y")).toBe(true);
  });

  it("detects array length mismatch", () => {
    const r = deepCompare([1, 2], [1, 2, 3]);
    expect(r.equal).toBe(false);
    expect(r.diffs.length).toBeGreaterThan(0);
  });

  it("detects array element diff with index path", () => {
    const r = deepCompare([1, 2, 3], [1, 9, 3]);
    expect(r.equal).toBe(false);
    expect(r.diffs.some((d) => d.path === "[1]")).toBe(true);
  });

  it("caps diffs at maxDiffs", () => {
    const a = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const b = { a: 9, b: 9, c: 9, d: 9, e: 9 };
    const r = deepCompare(a, b, 2);
    expect(r.diffs.length).toBe(2);
  });

  it("handles type mismatch", () => {
    const r = deepCompare({ x: 1 }, [1]);
    expect(r.equal).toBe(false);
  });

  it("treats NaN as equal", () => {
    expect(deepCompare(NaN, NaN).equal).toBe(true);
  });
});

describe("formatDiffs", () => {
  it("formats empty diffs", () => {
    expect(formatDiffs([])).toContain("No differences");
  });

  it("formats diff entries", () => {
    const out = formatDiffs([{ path: "a.b", a: 1, b: 2 }]);
    expect(out).toContain("a.b");
    expect(out).toContain("1");
    expect(out).toContain("2");
  });
});
