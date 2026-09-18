import { describe, expect, it } from "vitest";

import { isResponseMode, responseModes } from "./response-modes";

describe("isResponseMode", () => {
  it("accepts the supported modes", () => {
    for (const mode of ["brief", "standard", "deep"]) {
      expect(isResponseMode(mode)).toBe(true);
    }
  });

  it("rejects anything else, including near-misses", () => {
    for (const value of [
      "Brief",
      "BRIEF",
      "detailed",
      "deep ",
      "",
      null,
      undefined,
      0,
      1,
      true,
      {},
      [],
      ["brief"],
    ]) {
      expect(isResponseMode(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("responseModes", () => {
  it("offers a unique, well-labelled entry for every supported mode", () => {
    const values = responseModes.map((mode) => mode.value);

    expect(new Set(values).size).toBe(values.length);
    expect(values.sort()).toEqual(["brief", "deep", "standard"]);

    for (const mode of responseModes) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.detail.length).toBeGreaterThan(0);
    }
  });

  it("stays in sync with the type guard", () => {
    // Guards against a mode being added to the UI list without being accepted
    // by the parser (or vice versa), which would silently fall back to standard.
    for (const mode of responseModes) {
      expect(isResponseMode(mode.value), mode.value).toBe(true);
    }
  });
});
