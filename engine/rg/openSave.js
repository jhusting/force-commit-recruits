// CFB27 franchise-save opener for the force-commit tool.
// Same proven pattern as draftclasstool/roster-editor: 468_2 schema override, resolve tables BY NAME
// (ids shift between versions), free-list-safe row iteration.
const path = require('path');
const { FranchiseFile } = require('madden-franchise');

// schema dir: bundled 468_2.gz lives in engine-data at runtime
const SCHEMA_DIR = process.env.RG_SCHEMA_DIR || path.resolve(__dirname, '..', 'engine-data');
const SCHEMA_OVERRIDE = () => ({ major: 468, minor: 2, gameYear: 27, path: path.join(SCHEMA_DIR, 'C27_468_2.gz') });

/** Open a CFB27 dynasty save; resolves once tables are parsed. */
function openSave(savePath) {
  return new Promise((resolve, reject) => {
    const f = new FranchiseFile(savePath, {
      autoParse: true,
      schemaDirectory: SCHEMA_DIR,
      schemaOverride: SCHEMA_OVERRIDE(),
    });
    f.on('ready', () => resolve(f));
    f.on('error', reject);
  });
}

/** Resolve a table id by name — largest recordCapacity wins (several helper tables share names). */
function tableByName(file, name) {
  const hits = file.tables.filter((t) => t.name === name);
  if (!hits.length) throw new Error(`table not found: ${name}`);
  return hits.sort((a, b) => b.header.recordCapacity - a.header.recordCapacity)[0];
}

async function readTable(file, name) {
  const t = tableByName(file, name);
  await t.readRecords();
  return t;
}

/** Decode a 32-char binary-string reference into {tableId, row}, or null if empty/invalid. */
function parseRef(bin) {
  if (typeof bin !== 'string' || bin.length < 32 || !/[1-9]/.test(bin)) return null;
  return { tableId: parseInt(bin.slice(0, 15), 2), row: parseInt(bin.slice(15), 2) };
}

/** Encode {tableId,row} back into a 32-char reference. */
function makeRef(tableId, row) {
  return tableId.toString(2).padStart(15, '0') + row.toString(2).padStart(17, '0');
}

/** Safe field read (schema mismatches / free rows throw otherwise). */
const sf = (rec, field) => { try { return rec[field]; } catch { return undefined; } };

module.exports = { openSave, tableByName, readTable, parseRef, makeRef, sf, SCHEMA_DIR };
