import { spawn } from "node:child_process";

const binary = process.env.CODEX_BINARY || "codex";
const child = spawn(binary, ["app-server", "--stdio"], {
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let stderr = "";
let finished = false;
let threadCount = 0;

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function finish(error, modelCount = 0) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  child.kill();
  if (error) {
    console.error(`App-server smoke test failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `App-server smoke test passed; ${threadCount} thread(s) and ${modelCount} model(s) visible.`,
    );
  }
}

child.on("error", (error) => finish(error));
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.on("exit", (code, signal) => {
  if (!finished) {
    const detail = stderr.trim() || `exit ${signal || code || "unknown"}`;
    finish(new Error(`app-server stopped before responding: ${detail}`));
  }
});
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      finish(error);
      return;
    }
    if (message.id === 1 && message.error) {
      finish(new Error(message.error.message || "Initialization failed"));
      return;
    }
    if (message.id === 1) {
      send({ method: "initialized" });
      send({
        method: "thread/list",
        id: 2,
        params: {
          limit: 5,
          sortKey: "updated_at",
          sortDirection: "desc",
          sourceKinds: ["cli", "vscode", "exec", "appServer"],
        },
      });
    }
    if ((message.id === 2 || message.id === 3) && message.error) {
      finish(new Error(message.error.message || "Thread listing failed"));
      return;
    }
    if (message.id === 2) {
      threadCount = Array.isArray(message.result?.data)
        ? message.result.data.length
        : 0;
      send({
        method: "model/list",
        id: 3,
        params: { limit: 100, includeHidden: false },
      });
    }
    if (message.id === 3)
      finish(
        null,
        Array.isArray(message.result?.data) ? message.result.data.length : 0,
      );
  }
});

send({
  method: "initialize",
  id: 1,
  params: {
    clientInfo: {
      name: "codex-desktop-intel-smoke",
      title: "Codex Desktop Intel Smoke Test",
      version: "0.1.1",
    },
    capabilities: { experimentalApi: true, requestAttestation: false },
  },
});

const timeout = setTimeout(
  () => finish(new Error("Timed out after 15 seconds")),
  15_000,
);
