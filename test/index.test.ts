import { describe, expect, it } from "vitest";
import {
  attachToBrowser,
  computeCls,
  computeInp,
  createReporter,
  rate,
  THRESHOLDS,
} from "../src/index.js";

describe("public package exports", () => {
  it("exports all required public functions and definitions", () => {
    expect(typeof rate).toBe("function");
    expect(typeof computeCls).toBe("function");
    expect(typeof computeInp).toBe("function");
    expect(typeof createReporter).toBe("function");
    expect(typeof attachToBrowser).toBe("function");
    expect(THRESHOLDS).toBeDefined();
    expect(THRESHOLDS.CLS).toEqual([0.1, 0.25]);
  });
});
