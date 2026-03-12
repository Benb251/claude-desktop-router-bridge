const https = require("https");
const { Readable } = require("stream");

const { classifyRequest } = require("./route-classifier");
const { passthroughToAnthropic } = require("./anthropic-passthrough");
const { routeToRouter } = require("./router-adapter");
const { loadMitmTlsMaterial } = require("./ca-store");

function filterResponseHeaders(headers) {
  const nextHeaders = {};
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if ([
      "connection",
      "content-length",
      "content-encoding",
      "proxy-authenticate",
      "proxy-authorization",
      "transfer-encoding"
    ].includes(lowerKey)) {
      continue;
    }

    nextHeaders[key] = value;
  }
  return nextHeaders;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getRequestHost(req) {
  const hostHeader = String(req.headers.host || req.socket.servername || "");
  return hostHeader.replace(/:\d+$/, "");
}

async function writeFetchResponse(res, response, debugHeaders) {
  const headers = {
    ...filterResponseHeaders(response.headers),
    ...debugHeaders
  };

  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise((resolve, reject) => {
    Readable.fromWeb(response.body).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
  });
}

function createCoworkRequestEntry({
  host,
  method,
  pathname,
  classification,
  lane,
  upstream,
  statusCode,
  durationMs,
  error
}) {
  return {
    at: new Date().toISOString(),
    host,
    method,
    pathname,
    classification,
    lane,
    upstream,
    statusCode,
    durationMs,
    error: error ? String(error).slice(0, 500) : null
  };
}

async function createHttpsMitmServer({
  state,
  caDir,
  targetHosts,
  routerBaseUrl,
  routerApiKey,
  timeoutMs,
  listenPort,
  listenHosts
}) {
  const tlsMaterial = await loadMitmTlsMaterial({ caDir, targetHosts });
  state.setInstallState(tlsMaterial.installState);

  const defaultContext = tlsMaterial.secureContexts[targetHosts[0]];

  const server = https.createServer({
    ...tlsMaterial.defaultTlsOptions,
    SNICallback(servername, callback) {
      const context = tlsMaterial.secureContexts[servername] || defaultContext;
      callback(null, context);
    }
  }, async (req, res) => {
    const startedAt = Date.now();
    const host = getRequestHost(req);
    const pathname = req.url ? new URL(req.url, `https://${host}`).pathname : "/";
    const search = req.url ? new URL(req.url, `https://${host}`).search : "";
    const method = req.method || "GET";

    try {
      const body = await readRequestBody(req);
      const classification = classifyRequest({ method, pathname });
      const context = {
        host,
        method,
        pathname,
        search,
        headers: req.headers,
        body,
        timeoutMs
      };

      const result = classification === "router_passthrough"
        ? await routeToRouter({
            ...context,
            routerBaseUrl,
            routerApiKey
          })
        : await passthroughToAnthropic(context);

      await writeFetchResponse(res, result.response, {
        "x-chrono-spirit-cowork-mitm": "1",
        "x-chrono-spirit-cowork-classification": classification
      });

      state.recordRequest(createCoworkRequestEntry({
        host,
        method,
        pathname,
        classification,
        lane: state.getStatus().mode,
        upstream: result.upstream,
        statusCode: result.response.status,
        durationMs: Date.now() - startedAt
      }));
    } catch (error) {
      state.setError(error.message || error);
      const classification = classifyRequest({ method, pathname });
      const entry = createCoworkRequestEntry({
        host,
        method,
        pathname,
        classification,
        lane: state.getStatus().mode,
        upstream: host,
        statusCode: 502,
        durationMs: Date.now() - startedAt,
        error: error.message || error
      });
      state.recordRequest(entry);

      const payload = JSON.stringify({
        error: error.message || "Khong the xu ly Cowork MITM request",
        classification
      });
      res.writeHead(502, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        "x-chrono-spirit-cowork-mitm": "1",
        "x-chrono-spirit-cowork-classification": classification
      });
      res.end(payload);
    }
  });

  const extraServers = [];

  async function listenSingle(currentServer, options) {
    await new Promise((resolve, reject) => {
      currentServer.once("error", reject);
      currentServer.listen(options, () => {
        currentServer.removeListener("error", reject);
        resolve();
      });
    });
  }

  return {
    async start() {
      await listenSingle(server, { host: listenHosts[0], port: listenPort });

      for (const host of listenHosts.slice(1)) {
        const extraServer = https.createServer({
          ...tlsMaterial.defaultTlsOptions,
          SNICallback(servername, callback) {
            const context = tlsMaterial.secureContexts[servername] || defaultContext;
            callback(null, context);
          }
        }, server.listeners("request")[0]);

        await listenSingle(extraServer, {
          host,
          port: listenPort,
          ipv6Only: host === "::"
        });
        extraServers.push(extraServer);
      }
    },
    async stop() {
      await Promise.all([server, ...extraServers].map((currentServer) => new Promise((resolve) => currentServer.close(() => resolve()))));
    }
  };
}

module.exports = {
  createHttpsMitmServer
};
