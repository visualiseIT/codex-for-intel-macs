import { describe, expect, it } from "vitest";
import { isNearBottom } from "./scroll";

describe("isNearBottom", () => {
  it("keeps following output near the end of the conversation", () => {
    expect(isNearBottom(1_000, 430, 500)).toBe(true);
  });

  it("stops following output after the user scrolls upward", () => {
    expect(isNearBottom(1_000, 300, 500)).toBe(false);
  });
});
