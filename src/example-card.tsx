// /example-card.png: the homepage sample card, generated with randomized FAKE
// data on every request (no DB, no gating, explicit no-store). Demonstrates
// exactly what a real card looks like without exposing anyone's real data.
/** @jsxImportSource react */
import { Hono } from "hono";
import { ImageResponse, cache } from "@cf-wasm/og/workerd";
import { OgCard } from "./ui/og-card";
import type { AppEnv } from "./types";
import type { SanitizedSnapshot } from "./lib/sanitize";

const FIRST_NAMES = ["Marco", "Chiara", "Giulia", "Luca", "Sofia", "Davide", "Elena", "Pietro", "Marta", "Tommaso"];
const LAST_INITIALS = ["B.", "M.", "R.", "T.", "V.", "D.", "F.", "G."];
const CURRENCIES = ["EUR", "USD", "GBP"];
const GROUP_NAMES = [
  "Weekend in the mountains",
  "Flat 4B forever",
  "Pizza & board games",
  "Road trip 2027",
  "Cooking club",
  "Ski week coming soon",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fakeSnapshot(): SanitizedSnapshot {
  // two distinct fake members; initials unique per card
  const usedInitials = new Set<string>();
  const initial = () => {
    let i = pick(LAST_INITIALS);
    while (usedInitials.has(i)) i = pick(LAST_INITIALS);
    usedInitials.add(i);
    return i;
  };

  const first = `${pick(FIRST_NAMES)} ${initial()}`;
  let second = `${pick(FIRST_NAMES)} ${initial()}`;
  if (second === first) {
    // extremely small collision chance with masks; regenerate the label once
    second = `${pick(FIRST_NAMES)} ${initial()}`;
  }

  const settled = Math.random() < 0.2; // sometimes the lucky case
  const name = pick(GROUP_NAMES);
  const currencies = settled
    ? []
    : [
        {
          currencyCode: pick(CURRENCIES),
          debts: Array.from({ length: randomInt(1, 2) }, () => ({
            from: first,
            to: second,
            amount: `${randomInt(1, 200)}.${String(randomInt(0, 99)).padStart(2, "0")}`,
          })),
        },
      ];

  const snapshot: SanitizedSnapshot = {
    slug: "example",
    groupId: "0", // fake — clearly not a real Splitwise id
    name,
    updatedAt: new Date().toISOString(),
    currencies,
  };
  return snapshot;
}

export const exampleCard = new Hono<AppEnv>()

  .get("/example-card.png", async (c) => {
    // Required by @cf-wasm/og in workerd before first render.
    cache.setExecutionContext(c.executionCtx);

    const out = await ImageResponse.async(<OgCard snapshot={fakeSnapshot()} />, {
      width: 1200,
      height: 630,
    });

    const headers = new Headers(out instanceof Response ? out.headers : undefined);
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "no-store"); // random card per request by design
    return out instanceof Response
      ? new Response(out.body, { status: 200, headers })
      : new Response(out, { status: 200, headers });
  });
