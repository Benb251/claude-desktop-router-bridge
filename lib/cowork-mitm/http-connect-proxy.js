const http = require("http");
const net = require("net");

function createCoworkConnectProxy({
  state,
  listenHost,
  listenPort,
  mitmTlsHost,
  mitmTlsPort,
  targetHosts
}) {
  const hosts = new Set(targetHosts);

  const server = http.createServer((req, res) => {
    res.writeHead(501, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Cowork MITM chi ho tro HTTP CONNECT");
  });

  server.on("connect", (req, clientSocket, head) => {
    const startedAt = Date.now();
    const [targetHost, targetPortText] = String(req.url || "").split(":");
    const targetPort = Number(targetPortText || 443);
    const isMitmTarget = hosts.has(targetHost);
    const upstream = isMitmTarget ? `${mitmTlsHost}:${mitmTlsPort}` : `${targetHost}:${targetPort}`;
    const proxySocket = net.connect({
      host: isMitmTarget ? mitmTlsHost : targetHost,
      port: isMitmTarget ? mitmTlsPort : targetPort
    }, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length > 0) {
        proxySocket.write(head);
      }
      clientSocket.pipe(proxySocket);
      proxySocket.pipe(clientSocket);
      state.recordConnect({
        host: targetHost,
        port: targetPort,
        lane: "system-proxy",
        statusCode: 200,
        upstream
      });
    });

    proxySocket.on("error", (error) => {
      state.setError(error.message || error);
      state.recordConnect({
        host: targetHost,
        port: targetPort,
        lane: "system-proxy",
        statusCode: 502,
        upstream,
        error: error.message || error
      });
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
    });
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(listenPort, listenHost, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
    },
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

module.exports = {
  createCoworkConnectProxy
};
