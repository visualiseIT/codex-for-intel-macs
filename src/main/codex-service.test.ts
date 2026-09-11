import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./codex-service";

describe("normalizeUsage", () => {
  it("prefers the named Codex bucket and preserves reset information", () => {
    expect(
      normalizeUsage({
        rateLimits: { limitId: "legacy", primary: { usedPercent: 1 } },
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            limitName: "Codex",
            planType: "plus",
            rateLimitReachedType: null,
            primary: {
              usedPercent: 42,
              windowDurationMins: 300,
              resetsAt: 1_800_000_000,
            },
          },
        },
      }),
    ).toEqual({
      label: "Codex",
      planType: "plus",
      primary: {
        usedPercent: 42,
        windowDurationMins: 300,
        resetsAt: 1_800_000_000,
      },
      secondary: null,
      reached: false,
    });
  });

  it("returns null when rate limits are unavailable", () => {
    expect(normalizeUsage({})).toBeNull();
  });
});
