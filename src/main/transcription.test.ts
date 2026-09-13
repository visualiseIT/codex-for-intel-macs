import { describe, expect, it } from "vitest";
import { transcriptionText, validateDictationAudio } from "./transcription";

describe("dictation transcription", () => {
  it("accepts a recorded webm clip", () => {
    expect(
      validateDictationAudio({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm;codecs=opus",
        durationMs: 1_000,
      }),
    ).toBe("audio/webm");
  });

  it("rejects empty recordings", () => {
    expect(() =>
      validateDictationAudio({
        bytes: new Uint8Array(),
        mimeType: "audio/webm",
        durationMs: 1_000,
      }),
    ).toThrow("empty");
  });

  it("rejects recordings that are too short to contain useful speech", () => {
    expect(() =>
      validateDictationAudio({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm",
        durationMs: 100,
      }),
    ).toThrow("too short");
  });

  it("extracts transcript text", () => {
    expect(transcriptionText({ text: "  hello Codex  " })).toBe("hello Codex");
  });

  it("reports when no speech was detected", () => {
    expect(() => transcriptionText({ text: "" })).toThrow(
      "No speech was detected",
    );
  });
});
