const fs = require("fs");
const os = require("os");
const path = require("path");
const tls = require("tls");

const DEFAULT_CA_SUBDIR = path.join("ChronoSpirit", "cowork-mitm");

function getCoworkMitmRuntimeDir(explicitDir) {
  if (explicitDir) {
    return explicitDir;
  }

  const localAppData = process.env.LOCALAPPDATA || os.tmpdir();
  return path.join(localAppData, DEFAULT_CA_SUBDIR);
}

function getMitmMetadataPath(runtimeDir) {
  return path.join(runtimeDir, "install-state.json");
}

async function loadMitmMetadata(runtimeDir) {
  const metadataPath = getMitmMetadataPath(runtimeDir);
  try {
    const raw = (await fs.promises.readFile(metadataPath, "utf8")).replace(/^\uFEFF/, "");
    return {
      metadataPath,
      payload: JSON.parse(raw)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        metadataPath,
        payload: null
      };
    }
    throw error;
  }
}

async function loadMitmInstallState({ caDir, targetHosts }) {
  const runtimeDir = getCoworkMitmRuntimeDir(caDir);
  const { metadataPath, payload } = await loadMitmMetadata(runtimeDir);
  const hosts = Array.isArray(targetHosts) ? targetHosts : [];

  if (!payload) {
    return {
      runtimeDir,
      metadataPath,
      certificateInstalled: false,
      proxyInstalled: false,
      hostsInstalled: false,
      currentMode: null,
      payload: null
    };
  }

  const leaves = payload?.leaves || {};
  const certificateInstalled = hosts.every((host) => {
    const leaf = leaves[host];
    return leaf?.pfxPath && fs.existsSync(leaf.pfxPath);
  });

  return {
    runtimeDir,
    metadataPath,
    certificateInstalled,
    proxyInstalled: Boolean(payload?.proxy?.installed),
    hostsInstalled: Boolean(payload?.hosts?.installed),
    currentMode: payload?.currentMode || null,
    payload
  };
}

async function loadMitmTlsMaterial({ caDir, targetHosts }) {
  const installState = await loadMitmInstallState({ caDir, targetHosts });
  const payload = installState.payload;

  if (!payload) {
    throw new Error(`Khong tim thay install-state.json trong ${installState.runtimeDir}`);
  }

  const leaves = payload?.leaves || {};
  const [defaultHost] = targetHosts;
  const defaultLeaf = leaves[defaultHost];

  if (!defaultLeaf?.pfxPath) {
    throw new Error(`Khong tim thay leaf certificate cho ${defaultHost}`);
  }

  const contexts = {};
  for (const host of targetHosts) {
    const leaf = leaves[host];
    if (!leaf?.pfxPath) {
      throw new Error(`Khong tim thay leaf certificate cho ${host}`);
    }

    contexts[host] = tls.createSecureContext({
      pfx: await fs.promises.readFile(leaf.pfxPath),
      passphrase: leaf.passphrase
    });
  }

  return {
    installState,
    defaultTlsOptions: {
      pfx: await fs.promises.readFile(defaultLeaf.pfxPath),
      passphrase: defaultLeaf.passphrase
    },
    secureContexts: contexts
  };
}

module.exports = {
  getCoworkMitmRuntimeDir,
  getMitmMetadataPath,
  loadMitmInstallState,
  loadMitmMetadata,
  loadMitmTlsMaterial
};
