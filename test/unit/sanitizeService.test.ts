import { describe, expect, it } from "vitest";
import { memberLabel, sanitizeGroup, type RawGroupInput } from "../../src/domain/sanitizeService";

const RAW: RawGroupInput = {
  id: "999",
  name: "Flat 4B",
  updatedAt: "2026-11-09T10:00:00Z",
  members: [
    { id: "101", firstName: "Marco", lastName: "Panzeri" },
    { id: "202", firstName: "Ada", lastName: "Lovelace" },
    { id: "303", firstName: "Kim", lastName: "" }, // last-name-less member
  ],
  simplifiedDebts: [
    { from: "101", to: "202", amount: "12.50", currencyCode: "EUR" },
    { from: "202", to: "101", amount: "3.00", currencyCode: "USD" },
    { from: "555", to: "303", amount: "1.75", currencyCode: "EUR" }, // unknown member id
  ],
};

describe("memberLabel", () => {
  it("masks to first name + last initial", () => {
    const members = RAW.members;
    expect(memberLabel(members, "101")).toBe("Marco P.");
    expect(memberLabel(members, "202")).toBe("Ada L.");
  });

  it("falls back to first name only when last name missing", () => {
    expect(memberLabel(RAW.members, "303")).toBe("Kim");
  });

  it("marks unknown ids as Someone", () => {
    expect(memberLabel(RAW.members, "555")).toBe("Someone");
  });
});

describe("sanitizeGroup", () => {
  const snapshot = sanitizeGroup("slugslug1234567", RAW);

  it("groups debts by currency code (multi-currency checklist)", () => {
    expect(snapshot.currencies.map((c) => c.currencyCode)).toEqual(["EUR", "USD"]);
    expect(snapshot.currencies[0]?.debts).toHaveLength(2);
    expect(snapshot.currencies[1]?.debts).toEqual([
      { from: "Ada L.", to: "Marco P.", amount: "3.00" },
    ]);
  });

  it("keeps the full snapshot JSON free of sensitive fields", () => {
    const json = JSON.stringify(snapshot);
    // emails, avatars, invite links, full surnames, member ids never survive
    expect(json).not.toContain("@");
    expect(json).not.toContain("Panzeri");
    expect(json).not.toContain("Lovelace");
    expect(json).not.toContain("picture");
    expect(json).not.toContain("invite");
    expect(json).not.toContain("email");
    expect(/"(from|to)":"\d+"/.test(json)).toBe(false); // no raw numeric member ids
  });

  it("carries meta needed by the view and cache", () => {
    expect(snapshot.slug).toBe("slugslug1234567");
    expect(snapshot.groupId).toBe("999");
    expect(snapshot.name).toBe("Flat 4B");
    expect(snapshot.updatedAt).toBe(RAW.updatedAt);
  });

  it("handles a settled-up group (no debts)", () => {
    const settled = sanitizeGroup("slugslug9999999", { ...RAW, simplifiedDebts: [] });
    expect(settled.currencies).toEqual([]);
  });
});
