import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slotsPath = path.join(rootDir, "config", "desktop-slots.json");

async function readSlots() {
  const raw = await readFile(slotsPath, "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload?.slots) ? payload.slots : [];
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

async function waitForServer(url, attempts = 20) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health probe returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw lastError || new Error("Server did not become ready");
}

function createCatalogServer() {
  return http.createServer((req, res) => {
    if (req.url === "/v1/models") {
      const payload = {
        data: [
          { id: "cx/gpt-5.4", owned_by: "cx", root: "gpt-5.4" },
          { id: "cx/gpt-5.3-codex-high", owned_by: "cx", root: "gpt-5.3-codex-high" },
          { id: "cc/claude-sonnet-4-6", owned_by: "cc", root: "claude-sonnet-4-6" }
        ]
      };

      const body = JSON.stringify(payload);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
}

async function main() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "chrono-spirit-smoke-"));
  const slots = await readSlots();
  const dbPath = path.join(tmpDir, "db.json");

  await writeFile(dbPath, `${JSON.stringify({ modelAliases: {} }, null, 2)}\n`, "utf8");

  const catalogServer = createCatalogServer();
  const catalogPort = await listen(catalogServer);
  const appPort = catalogPort + 1;
  const appUrl = `http://127.0.0.1:${appPort}`;
  const routerBaseUrl = `http://127.0.0.1:${catalogPort}/v1`;

  const appProcess = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      NINE_ROUTER_BASE_URL: routerBaseUrl,
      NINE_ROUTER_DB_PATH: dbPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const output = [];
  appProcess.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  appProcess.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  try {
    await waitForServer(`${appUrl}/api/health`);

    const health = await fetch(`${appUrl}/api/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.modelsEndpoint.ok, true);

    const catalog = await fetch(`${appUrl}/api/catalog/models`).then((response) => response.json());
    assert.equal(catalog.ok, true);
    assert.ok(Array.isArray(catalog.models));
    assert.ok(catalog.models.length >= 3);

    const bridgeState = await fetch(`${appUrl}/api/bridge/state`).then((response) => response.json());
    assert.equal(Array.isArray(bridgeState.slots), true);
    assert.equal(bridgeState.slots.length, slots.length);

    const targetSlot = slots[0]?.id;
    const applyResponse = await fetch(`${appUrl}/api/bridge/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mappings: {
          [targetSlot]: "cx/gpt-5.4"
        }
      })
    });

    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json();
    assert.equal(applied.ok, true);
    assert.equal(applied.validation.ok, true);
    assert.equal(applied.bridge.aliases[targetSlot], "cx/gpt-5.4");
    await access(applied.backupPath);

    const persistedDb = JSON.parse(await readFile(dbPath, "utf8"));
    assert.equal(persistedDb.modelAliases[targetSlot], "cx/gpt-5.4");

    const indexResponse = await fetch(`${appUrl}/`);
    assert.equal(indexResponse.status, 200);
    const indexHtml = await indexResponse.text();
    assert.match(indexHtml, /Bridge Console/);

    const appBundle = await fetch(`${appUrl}/app.js`);
    assert.equal(appBundle.status, 200);

    console.log("Smoke test passed.");
  } finally {
    appProcess.kill();
    await closeServer(catalogServer);
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
