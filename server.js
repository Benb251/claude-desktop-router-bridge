const http = require("http");
const fs = require("fs");
const path = require("path");

const { applyMappings, buildBridgeState } = require("./lib/bridge-db");
const { buildModelsEndpointUrl, fetchLiveModelCatalog } = require("./lib/router-catalog");

const PORT = Number(process.env.PORT || 4311);
const ROUTER_BASE_URL = (process.env.NINE_ROUTER_BASE_URL || "http://localhost:20128/v1").replace(/\/$/, "");
const ROUTER_API_KEY = process.env.NINE_ROUTER_API_KEY || "";
const ROUTER_DB_PATH = process.env.NINE_ROUTER_DB_PATH || path.join(process.env.APPDATA || "", "9router", "db.json");

const publicDir = path.join(__dirname, "public");
const desktopSlotsPath = path.join(__dirname, "config", "desktop-slots.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(data);
  });
}

async function handleHealth(res) {
  const catalog = await fetchLiveModelCatalog({
    routerBaseUrl: ROUTER_BASE_URL,
    apiKey: ROUTER_API_KEY
  });

  sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    routerBaseUrl: ROUTER_BASE_URL,
    routerDbPath: ROUTER_DB_PATH,
    modelsEndpoint: {
      url: buildModelsEndpointUrl(ROUTER_BASE_URL),
      ok: catalog.ok
    }
  });
}

async function handleCatalog(res) {
  const catalog = await fetchLiveModelCatalog({
    routerBaseUrl: ROUTER_BASE_URL,
    apiKey: ROUTER_API_KEY
  });
  sendJson(res, 200, catalog);
}

async function handleBridgeGet(res) {
  try {
    const payload = await buildBridgeState({
      dbPath: ROUTER_DB_PATH,
      slotsPath: desktopSlotsPath
    });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, { error: `Cannot load bridge state: ${error.message}` });
  }
}

async function handleBridgePost(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const body = JSON.parse(rawBody || "{}");
    const payload = await applyMappings({
      dbPath: ROUTER_DB_PATH,
      slotsPath: desktopSlotsPath,
      mappings: body.mappings
    });

    sendJson(res, 200, {
      ok: true,
      backupPath: payload.backupPath,
      validation: payload.validation,
      bridge: payload.bridge
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Unexpected bridge failure"
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Missing URL" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    await handleHealth(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/catalog/models") {
    await handleCatalog(res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/bridge/state") {
    await handleBridgeGet(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/bridge/state") {
    await handleBridgePost(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`chrono-spirit listening on http://localhost:${PORT}`);
  console.log(`Router base: ${ROUTER_BASE_URL}`);
  console.log(`Router DB: ${ROUTER_DB_PATH}`);
});
