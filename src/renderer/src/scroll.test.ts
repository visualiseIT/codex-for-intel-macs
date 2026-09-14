import { describe, expect, it } from "vitest";
import { isNearBottom, nextPromptOffset, previousPromptOffset } from "./scroll";

describe("isNearBottom", () => {
  it("keeps following output near the end of the conversation", () => {
    expect(isNearBottom(1_000, 430, 500)).toBe(true);
  });

  it("stops following output after the user scrolls upward", () => {
    expect(isNearBottom(1_000, 300, 500)).toBe(false);
  });
});

describe("previousPromptOffset", () => {
  it("finds the nearest prompt above the current scroll position", () => {
    expect(previousPromptOffset([40, 300, 720], 690)).toBe(300);
  });

  it("does not jump when no earlier prompt exists", () => {
    expect(previousPromptOffset([100, 300], 110)).toBeNull();
  });
});

describe("nextPromptOffset", () => {
  it("finds the nearest prompt below the current scroll position", () => {
    expect(nextPromptOffset([40, 300, 720], 330)).toBe(720);
  });

  it("does not jump when no later prompt exists", () => {
    expect(nextPromptOffset([100, 300], 290)).toBeNull();
  });
});
