const { createCoworkMitmState } = require("./state");
const { createHttpsMitmServer } = require("./https-mitm-server");
const { createCoworkConnectProxy } = require("./http-connect-proxy");
const { getCoworkMitmRuntimeDir, loadMitmInstallState } = require("./ca-store");

const DEFAULT_TARGET_HOSTS = ["api.anthropic.com", "a-api.anthropic.com"];
const DEFAULT_PROXY_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = 8877;
const DEFAULT_TLS_PORT = 443;
const DEFAULT_LOG_BODY_BYTES = 2048;
const DEFAULT_TIMEOUT_MS = 45000;

function parseTargetHosts(value) {
  if (!value) {
    return [...DEFAULT_TARGET_HOSTS];
  }

  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function createCoworkMitm({
  enabled = false,
  mode = "system-proxy",
  targetHosts = DEFAULT_TARGET_HOSTS,
  caDir,
  proxyHost = DEFAULT_PROXY_HOST,
  proxyPort = DEFAULT_PROXY_PORT,
  tlsPort = DEFAULT_TLS_PORT,
  routerBaseUrl,
  routerApiKey = "",
  logBodyBytes = DEFAULT_LOG_BODY_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const normalizedTargets = parseTargetHosts(targetHosts);
  const runtimeDir = getCoworkMitmRuntimeDir(caDir);
  const state = createCoworkMitmState({
    enabled,
    mode,
    targetHosts: normalizedTargets,
    caDir: runtimeDir,
    proxyPort,
    tlsPort,
    logBodyBytes
  });

  let proxyServer = null;
  let tlsServer = null;

  async function refreshInstallState() {
    state.setEnabled(enabled);
    const installState = await loadMitmInstallState({
      caDir: runtimeDir,
      targetHosts: normalizedTargets
    });

    state.setInstallState(installState);
    if (installState.currentMode) {
      state.setMode(installState.currentMode);
    }
    return installState;
  }

  async function start() {
    await refreshInstallState();

    if (!enabled) {
      state.setListening(false);
      return state.getStatus();
    }

    try {
      tlsServer = await createHttpsMitmServer({
        state,
        caDir: runtimeDir,
        targetHosts: normalizedTargets,
        routerBaseUrl,
        routerApiKey,
        timeoutMs,
        listenPort: tlsPort,
        listenHosts: ["0.0.0.0", "::"]
      });
      await tlsServer.start();

      proxyServer = createCoworkConnectProxy({
        state,
        listenHost: proxyHost,
        listenPort: proxyPort,
        mitmTlsHost: "127.0.0.1",
        mitmTlsPort: tlsPort,
        targetHosts: normalizedTargets
      });
      await proxyServer.start();

      state.setListening(true);
      state.setError(null);
    } catch (error) {
      state.setListening(false);
      state.setError(error.message || error);
    }

    return state.getStatus();
  }

  async function stop() {
    const tasks = [];
    if (proxyServer) {
      tasks.push(proxyServer.stop());
    }
    if (tlsServer) {
      tasks.push(tlsServer.stop());
    }
    await Promise.all(tasks);
    state.setListening(false);
  }

  async function getStatus() {
    await refreshInstallState();
    return state.getStatus();
  }

  async function getRecent() {
    await refreshInstallState();
    return state.getRecent();
  }

  async function getConfig() {
    await refreshInstallState();
    return state.getConfig();
  }

  return {
    start,
    stop,
    getStatus,
    getRecent,
    getConfig
  };
}

module.exports = {
  DEFAULT_LOG_BODY_BYTES,
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
  DEFAULT_TARGET_HOSTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TLS_PORT,
  createCoworkMitm,
  parseTargetHosts
};
