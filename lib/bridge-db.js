const fs = require("fs");

async function readJsonFile(filePath) {
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await fs.promises.writeFile(filePath, payload, "utf8");
}

async function loadSlots(slotsPath) {
  const payload = await readJsonFile(slotsPath);
  return Array.isArray(payload?.slots) ? payload.slots : [];
}

async function buildBridgeState({ dbPath, slotsPath }) {
  const [slots, db] = await Promise.all([loadSlots(slotsPath), readJsonFile(dbPath)]);
  const aliases = {};

  for (const slot of slots) {
    aliases[slot.id] = db?.modelAliases?.[slot.id] || "";
  }

  return {
    slots,
    bridge: {
      dbPath,
      aliases
    }
  };
}

function sanitizeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

function validateMappings(mappings, validSlots) {
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    return "Payload mappings không hợp lệ";
  }

  for (const [slotId, target] of Object.entries(mappings)) {
    if (!validSlots.has(slotId)) {
      return `Slot không được hỗ trợ: ${slotId}`;
    }

    if (!String(target || "").trim()) {
      return `Model đích không được để trống cho slot: ${slotId}`;
    }
  }

  return null;
}

async function applyMappings({ dbPath, slotsPath, mappings }) {
  const slots = await loadSlots(slotsPath);
  const validSlots = new Set(slots.map((slot) => slot.id));
  const error = validateMappings(mappings, validSlots);

  if (error) {
    const rejection = new Error(error);
    rejection.statusCode = 400;
    throw rejection;
  }

  const db = await readJsonFile(dbPath);
  const nextAliases = { ...(db.modelAliases || {}) };

  for (const [slotId, target] of Object.entries(mappings)) {
    nextAliases[slotId] = String(target).trim();
  }

  db.modelAliases = nextAliases;

  const backupPath = `${dbPath}.bak-${sanitizeTimestamp(new Date().toISOString())}`;
  await fs.promises.copyFile(dbPath, backupPath);
  await writeJsonFile(dbPath, db);

  const reread = await readJsonFile(dbPath);
  const mismatches = [];

  for (const [slotId, target] of Object.entries(mappings)) {
    const actual = reread?.modelAliases?.[slotId] || "";
    if (actual !== String(target).trim()) {
      mismatches.push({
        slotId,
        expected: String(target).trim(),
        actual
      });
    }
  }

  return {
    backupPath,
    validation: {
      ok: mismatches.length === 0,
      mismatches
    },
    ...(await buildBridgeState({ dbPath, slotsPath }))
  };
}

module.exports = {
  applyMappings,
  buildBridgeState,
  loadSlots,
  readJsonFile
};
