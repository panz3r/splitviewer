import enJson from "../src/i18n/en.json";
import itJson from "../src/i18n/it.json";
import { getDict, type Lang } from "../src/i18n";
import { describe, expect, it } from "vitest";

// Deep key parity between language files. Compile time enforces this too
// (it.json is typed as Dict = typeof en.json), but this test gives a
// translator-friendly failure message listing the exact missing keys.

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

const enKeys = new Set(keyPaths(enJson));
const itKeys = new Set(keyPaths(itJson));

describe("i18n dictionaries", () => {
  it("it.json has every key en.json has", () => {
    const missing = [...enKeys].filter((k) => !itKeys.has(k));
    expect(missing, `Missing in it.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("it.json has no extra keys", () => {
    const extra = [...itKeys].filter((k) => !enKeys.has(k));
    expect(extra, `Extra in it.json: ${extra.join(", ")}`).toEqual([]);
  });

  it("all leaf values are non-empty strings", () => {
    for (const k of enKeys) {
      const v = k.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], enJson);
      expect(typeof v, `${k} must be a string`).toBe("string");
      expect((v as string).length, `${k} must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("getDict returns the right language", () => {
    expect(getDict("en" as Lang).nav.support).toBe("Support");
    expect(getDict("it" as Lang).nav.support).toBe("Supporto");
  });
});
