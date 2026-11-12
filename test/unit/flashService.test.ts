import { describe, expect, it } from "vitest";
import { resolveFlash } from "../../src/domain/flashService";

// Unit tests for flash resolution: query params → localized text, with the
// param→dict-key mapping made explicit (this mapping was implicit and broken
// before the MVC refactor — see the phase 02.9 commit note).

describe("resolveFlash", () => {
  it("maps success params to EN text", () => {
    expect(resolveFlash("en", "created")).toEqual({ msg: "Public link generated — copy it below." });
    expect(resolveFlash("en", "revoked")).toEqual({ msg: "Share revoked — the public link is dead." });
  });

  it("maps error params to EN text", () => {
    expect(resolveFlash("en", undefined, "not_found")).toEqual({
      err: "No such share (or it belongs to another account).",
    });
    expect(resolveFlash("en", undefined, "invalid_request")).toEqual({
      err: "That didn't look right — try again.",
    });
    expect(resolveFlash("en", undefined, "share_write_failed")).toEqual({
      err: "Couldn't save the share. Please retry.",
    });
  });

  it("localizes to Italian", () => {
    expect(resolveFlash("it", "created")).toEqual({ msg: "Link pubblico generato — copialo qui sotto." });
    expect(resolveFlash("it", undefined, "not_found")).toEqual({
      err: "Condivisione inesistente (o appartiene a un altro account).",
    });
  });

  it("resolves both msg and err when both params are present", () => {
    const resolved = resolveFlash("en", "revoked", "not_found");
    expect(resolved?.msg).toBeTruthy();
    expect(resolved?.err).toBeTruthy();
  });

  it("never leaks raw params: unknown keys resolve to undefined", () => {
    expect(resolveFlash("en", "h4x")).toBeUndefined();
    expect(resolveFlash("en", undefined, "h4x")).toBeUndefined();
    expect(resolveFlash("en", "h4x", "h4x")).toBeUndefined();
  });

  it("returns undefined when no params given", () => {
    expect(resolveFlash("en")).toBeUndefined();
  });
});
