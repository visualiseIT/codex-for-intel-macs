import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { safeStorage } from "electron";
import type { DictationAudio, TranscriptionStatus } from "../shared/types";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIN_AUDIO_DURATION_MS = 400;
const TRANSCRIPTION_MODEL = "gpt-transcribe";
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
]);

export function validateDictationAudio(audio: DictationAudio): string {
  if (!(audio.bytes instanceof Uint8Array) || audio.bytes.byteLength === 0)
    throw new Error("The microphone recording is empty.");
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES)
    throw new Error("Dictation recordings must be 25 MB or smaller.");
  if (
    !Number.isFinite(audio.durationMs) ||
    audio.durationMs < MIN_AUDIO_DURATION_MS
  )
    throw new Error(
      "That recording was too short. Click the microphone, speak, then click it again to stop.",
    );
  const mimeType = audio.mimeType.split(";", 1)[0].toLowerCase();
  if (!SUPPORTED_AUDIO_TYPES.has(mimeType))
    throw new Error(
      `Unsupported dictation audio type: ${mimeType || "unknown"}.`,
    );
  return mimeType;
}

export function transcriptionText(value: unknown): string {
  if (typeof value !== "object" || value === null)
    throw new Error("The transcription service returned an invalid response.");
  const text = (value as { text?: unknown }).text;
  if (typeof text !== "string" || !text.trim())
    throw new Error(
      "No speech was detected. Check the microphone input, then try again while speaking clearly.",
    );
  return text.trim();
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "audio/mpeg") return "mp3";
  return mimeType.slice("audio/".length);
}

export class TranscriptionService {
  constructor(private readonly keyPath: string) {}

  status(): TranscriptionStatus {
    const hasEnvironmentKey = Boolean(process.env.OPENAI_API_KEY);
    const hasStoredKey = existsSync(this.keyPath);
    return {
      configured: hasEnvironmentKey || hasStoredKey,
      source: hasEnvironmentKey
        ? "environment"
        : hasStoredKey
          ? "keychain"
          : "none",
      model: TRANSCRIPTION_MODEL,
    };
  }

  setApiKey(value: string): TranscriptionStatus {
    const apiKey = value.trim();
    if (!apiKey) {
      if (existsSync(this.keyPath)) unlinkSync(this.keyPath);
      return this.status();
    }
    if (apiKey.length < 20)
      throw new Error("That OpenAI API key appears to be incomplete.");
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("macOS Keychain encryption is not currently available.");
    const encrypted = safeStorage.encryptString(apiKey).toString("base64");
    writeFileSync(this.keyPath, encrypted, { encoding: "utf8", mode: 0o600 });
    return this.status();
  }

  async transcribe(audio: DictationAudio): Promise<string> {
    const mimeType = validateDictationAudio(audio);
    const apiKey = process.env.OPENAI_API_KEY || this.storedKey();
    if (!apiKey)
      throw new Error("Add an OpenAI API key in Settings before dictating.");

    const body = new FormData();
    const audioBuffer = new ArrayBuffer(audio.bytes.byteLength);
    new Uint8Array(audioBuffer).set(audio.bytes);
    body.append("model", TRANSCRIPTION_MODEL);
    body.append("response_format", "json");
    body.append(
      "file",
      new Blob([audioBuffer], { type: mimeType }),
      `dictation.${extensionForMimeType(mimeType)}`,
    );
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(120_000),
      },
    );
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        typeof (result as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? (result as { error: { message: string } }).error.message
          : `Transcription failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    return transcriptionText(result);
  }

  private storedKey(): string {
    if (!existsSync(this.keyPath) || !safeStorage.isEncryptionAvailable())
      return "";
    try {
      const encrypted = Buffer.from(
        readFileSync(this.keyPath, "utf8"),
        "base64",
      );
      return safeStorage.decryptString(encrypted);
    } catch {
      return "";
    }
  }
}
