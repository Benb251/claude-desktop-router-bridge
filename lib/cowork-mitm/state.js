const MAX_RECENT_REQUESTS = 50;

function previewError(error) {
  if (!error) {
    return null;
  }

  return String(error).slice(0, 500);
}

function createCoworkMitmState({
  enabled,
  mode,
  targetHosts,
  caDir,
  proxyPort,
  tlsPort,
  logBodyBytes
}) {
  const state = {
    enabled: Boolean(enabled),
    mode,
    listening: false,
    certificateInstalled: false,
    proxyInstalled: false,
    hostsInstalled: false,
    connectCount: 0,
    requestCount: 0,
    routerRequestCount: 0,
    passthroughRequestCount: 0,
    lastRequestAt: null,
    lastError: null,
    startedAt: null,
    recentRequests: [],
    targetHosts: [...targetHosts],
    caDir,
    proxyPort,
    tlsPort,
    logBodyBytes,
    runtimeMetadata: null
  };

  function setMode(nextMode) {
    state.mode = nextMode;
  }

  function setEnabled(value) {
    state.enabled = Boolean(value);
  }

  function setListening(value) {
    state.listening = Boolean(value);
    if (state.listening && !state.startedAt) {
      state.startedAt = new Date().toISOString();
    }
  }

  function setInstallState(metadata) {
    state.runtimeMetadata = metadata || null;
    state.certificateInstalled = Boolean(metadata?.certificateInstalled);
    state.proxyInstalled = Boolean(metadata?.proxyInstalled);
    state.hostsInstalled = Boolean(metadata?.hostsInstalled);
    if (metadata?.currentMode) {
      state.mode = metadata.currentMode;
    }
  }

  function setError(error) {
    state.lastError = previewError(error);
  }

  function recordConnect({ host, port, lane, statusCode, upstream, error }) {
    state.connectCount += 1;
    state.lastRequestAt = new Date().toISOString();

    state.recentRequests.unshift({
      at: state.lastRequestAt,
      host,
      method: "CONNECT",
      pathname: host,
      classification: "connect_tunnel",
      lane,
      upstream,
      statusCode,
      durationMs: 0,
      error: previewError(error)
    });

    state.recentRequests = state.recentRequests.slice(0, MAX_RECENT_REQUESTS);
  }

  function recordRequest(entry) {
    state.requestCount += 1;
    state.lastRequestAt = entry.at;

    if (entry.classification === "router_passthrough") {
      state.routerRequestCount += 1;
    } else {
      state.passthroughRequestCount += 1;
    }

    state.recentRequests.unshift(entry);
    state.recentRequests = state.recentRequests.slice(0, MAX_RECENT_REQUESTS);
  }

  function getStatus() {
    return {
      enabled: state.enabled,
      mode: state.mode,
      listening: state.listening,
      certificateInstalled: state.certificateInstalled,
      proxyInstalled: state.proxyInstalled,
      hostsInstalled: state.hostsInstalled,
      requestCount: state.requestCount,
      routerRequestCount: state.routerRequestCount,
      passthroughRequestCount: state.passthroughRequestCount,
      lastRequestAt: state.lastRequestAt,
      lastError: state.lastError,
      startedAt: state.startedAt,
      recentRequests: state.recentRequests
    };
  }

  function getConfig() {
    return {
      enabled: state.enabled,
      mode: state.mode,
      targetHosts: state.targetHosts,
      caDir: state.caDir,
      proxyPort: state.proxyPort,
      tlsPort: state.tlsPort,
      logBodyBytes: state.logBodyBytes,
      runtimeMetadata: state.runtimeMetadata
    };
  }

  function getRecent() {
    return state.recentRequests;
  }

  return {
    getStatus,
    getConfig,
    getRecent,
    recordConnect,
    recordRequest,
    setEnabled,
    setError,
    setInstallState,
    setListening,
    setMode
  };
}

module.exports = {
  createCoworkMitmState
};
