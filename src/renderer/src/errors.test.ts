import { describe, expect, it } from "vitest";
import { readableError } from "./errors";

describe("readableError", () => {
  it("removes Electron's remote invocation wrapper", () => {
    expect(
      readableError(
        new Error(
          "Error invoking remote method 'app:transcribe-audio': Error: No speech was detected.",
        ),
      ),
    ).toBe("No speech was detected.");
  });

  it("preserves ordinary error messages", () => {
    expect(readableError(new Error("Microphone access was denied."))).toBe(
      "Microphone access was denied.",
    );
  });
});
