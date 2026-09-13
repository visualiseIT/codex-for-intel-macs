import { describe, expect, it } from "vitest";
import { transcriptionText, validateDictationAudio } from "./transcription";

describe("dictation transcription", () => {
  it("accepts a recorded webm clip", () => {
    expect(
      validateDictationAudio({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm;codecs=opus",
      }),
    ).toBe("audio/webm");
  });

  it("rejects empty recordings", () => {
    expect(() =>
      validateDictationAudio({
        bytes: new Uint8Array(),
        mimeType: "audio/webm",
      }),
    ).toThrow("empty");
  });

  it("extracts transcript text", () => {
    expect(transcriptionText({ text: "  hello Codex  " })).toBe("hello Codex");
  });
});
