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
let archivedCount = 0;
let modelCount = 0;
let usageAvailable = false;
let firstThreadId = "";
let paginatedTurnCount = 0;

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  child.kill();
  if (error) {
    console.error(`App-server smoke test failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(
      `App-server smoke test passed; ${threadCount} active thread(s), ${archivedCount} archived thread(s), ${modelCount} model(s), ${paginatedTurnCount} paginated turn(s), usage ${usageAvailable ? "available" : "unavailable"}.`,
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
    if (message.id >= 2 && message.id <= 4 && message.error) {
      finish(new Error(message.error.message || "Thread listing failed"));
      return;
    }
    if (message.id === 2) {
      const threads = Array.isArray(message.result?.data)
        ? message.result.data
        : [];
      threadCount = threads.length;
      firstThreadId = threads[0]?.id || "";
      send({
        method: "model/list",
        id: 3,
        params: { limit: 100, includeHidden: false },
      });
    }
    if (message.id === 3) {
      modelCount = Array.isArray(message.result?.data)
        ? message.result.data.length
        : 0;
      send({
        method: "thread/list",
        id: 4,
        params: {
          limit: 5,
          archived: true,
          sortKey: "updated_at",
          sortDirection: "desc",
        },
      });
    }
    if (message.id === 4) {
      archivedCount = Array.isArray(message.result?.data)
        ? message.result.data.length
        : 0;
      send({ method: "account/rateLimits/read", id: 5, params: {} });
    }
    if (message.id === 5) {
      usageAvailable = !message.error && Boolean(message.result?.rateLimits);
      if (!firstThreadId) {
        finish(null);
        return;
      }
      send({
        method: "thread/turns/list",
        id: 6,
        params: {
          threadId: firstThreadId,
          limit: 2,
          sortDirection: "desc",
          itemsView: "full",
        },
      });
    }
    if (message.id === 6) {
      if (message.error) {
        finish(new Error(message.error.message || "Turn pagination failed"));
        return;
      }
      paginatedTurnCount = Array.isArray(message.result?.data)
        ? message.result.data.length
        : 0;
      finish(null);
    }
  }
});

send({
  method: "initialize",
  id: 1,
  params: {
    clientInfo: {
      name: "codex-desktop-intel-smoke",
      title: "Codex Desktop Intel Smoke Test",
      version: "0.2.0",
    },
    capabilities: { experimentalApi: true, requestAttestation: false },
  },
});

const timeout = setTimeout(
  () => finish(new Error("Timed out after 15 seconds")),
  15_000,
);
