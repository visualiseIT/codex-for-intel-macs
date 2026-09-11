import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { JsonLineParser } from "./json-lines";
import { RpcRequestTracker, type RpcResponse } from "./rpc-request-tracker";

interface RpcIncomingRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

interface RpcNotification {
  method: string;
  params?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function findCodexBinary(): string {
  const override = process.env.CODEX_BINARY;
  if (override && existsSync(override)) return override;

  const pathCandidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, "codex"));
  const directCandidates = [
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local", "bin", "codex"),
    join(homedir(), ".npm-global", "bin", "codex"),
  ];
  const nvmRoot = join(homedir(), ".nvm", "versions", "node");
  const nvmCandidates = existsSync(nvmRoot)
    ? readdirSync(nvmRoot)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((version) => join(nvmRoot, version, "bin", "codex"))
    : [];

  const located = [
    ...pathCandidates,
    ...directCandidates,
    ...nvmCandidates,
  ].find(existsSync);
  if (!located) {
    throw new Error(
      "Could not find the Codex CLI. Install it or set CODEX_BINARY to the full codex executable path.",
    );
  }
  return located;
}

export class CodexProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly requests = new RpcRequestTracker();
  private readonly parser = new JsonLineParser();

  async connect(): Promise<void> {
    if (this.child) return;

    const binary = findCodexBinary();
    const child = spawn(binary, ["app-server", "--stdio"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      try {
        for (const message of this.parser.push(chunk))
          this.handleMessage(message);
      } catch (error) {
        this.emit(
          "protocol-error",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => this.emit("log", chunk.trim()));
    child.on("error", (error) => this.handleExit(error));
    child.on("exit", (code, signal) => {
      this.handleExit(
        new Error(`Codex app-server exited (${signal ?? code ?? "unknown"}).`),
      );
    });

    await this.request("initialize", {
      clientInfo: {
        name: "codex-desktop-intel",
        title: "Codex Desktop Intel",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
    this.notify("initialized");
  }

  request<T>(method: string, params: unknown = {}): Promise<T> {
    const id = this.nextId++;
    const result = this.requests.wait<T>(id, method);
    try {
      this.write({ method, id, params });
    } catch (error) {
      this.requests.reject(
        id,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    return result;
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  respond(id: number | string, result: unknown): void {
    this.write({ id, result });
  }

  respondError(id: number | string, message: string, code = -32601): void {
    this.write({ id, error: { code, message } });
  }

  close(): void {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
    this.rejectPending(new Error("Codex app-server stopped."));
  }

  private write(message: unknown): void {
    if (!this.child?.stdin.writable)
      throw new Error("Codex app-server is not connected.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleMessage(value: unknown): void {
    if (!isRecord(value)) return;
    const hasId = typeof value.id === "number" || typeof value.id === "string";
    const hasMethod = typeof value.method === "string";

    if (hasId && !hasMethod) {
      const response = value as unknown as RpcResponse;
      this.requests.settle(response);
      return;
    }

    if (hasId && hasMethod) {
      this.emit("request", value as unknown as RpcIncomingRequest);
      return;
    }

    if (hasMethod)
      this.emit("notification", value as unknown as RpcNotification);
  }

  private handleExit(error: Error): void {
    if (!this.child) return;
    this.child = null;
    this.rejectPending(error);
    this.emit("exit", error);
  }

  private rejectPending(error: Error): void {
    this.requests.rejectAll(error);
  }
}
