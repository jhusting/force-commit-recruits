#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const positional = args.filter(a => !a.startsWith('--'));

// ── Colors (no deps) ─────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

// ── Save auto-detection ──────────────────────────────────────────────────────
function getDocFolders() {
  const home = os.homedir();
  const dirs = [path.join(home, 'Documents')];
  try {
    for (const d of fs.readdirSync(home)) {
      if (/^OneDrive/i.test(d)) dirs.push(path.join(home, d, 'Documents'));
    }
  } catch {}
  return [...new Set(dirs)];
}

function findSavesFolder() {
  const docFolders = getDocFolders();
  const score = (name) => (/beta/i.test(name) ? 2 : 0) + (/\b27\b|Football 27/i.test(name) ? 0 : 1);
  for (const docDir of docFolders) {
    if (!fs.existsSync(docDir)) continue;
    let entries;
    try { entries = fs.readdirSync(docDir); } catch { continue; }
    const matches = entries
      .filter(e => /^EA SPORTS College Football/i.test(e))
      .sort((a, b) => score(a) - score(b));
    for (const m of matches) {
      const savesDir = path.join(docDir, m, 'saves');
      if (fs.existsSync(savesDir)) return savesDir;
    }
  }
  return null;
}

function isFBCHUNKS(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return buf.toString('latin1') === 'FBCHUNKS';
  } catch { return false; }
}

function listSaves(folder) {
  if (!fs.existsSync(folder)) return [];
  let entries;
  try { entries = fs.readdirSync(folder); } catch { return []; }
  return entries.filter(name => {
    const lower = name.toLowerCase();
    if (!lower.startsWith('dynasty') || name.includes('.') || lower.endsWith('-autosave')) return false;
    const full = path.join(folder, name);
    try { if (!fs.statSync(full).isFile()) return false; } catch { return false; }
    return isFBCHUNKS(full);
  }).sort();
}

function askChoice(question, count) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      const n = parseInt(answer, 10);
      resolve(Number.isFinite(n) && n >= 1 && n <= count ? n - 1 : -1);
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}CFB27 Set Coach XP — Fastest${c.reset}`);
  console.log(`${c.dim}────────────────────────────${c.reset}\n`);

  if (dryRun) console.log(`${c.yellow}DRY RUN${c.reset} — no changes will be written\n`);

  // Set up schema path before requiring engine modules
  const engineData = path.resolve(__dirname, 'engine-data');
  process.env.RG_SCHEMA_DIR = engineData;

  // Resolve save path
  let savePath;
  if (positional.length > 0 && path.isAbsolute(positional[0]) && fs.existsSync(positional[0])) {
    savePath = positional[0];
  } else {
    const savesFolder = findSavesFolder();
    if (!savesFolder) {
      console.error(`${c.red}Could not auto-detect saves folder.${c.reset} Pass a full save path as an argument.`);
      process.exit(1);
    }
    console.log(`${c.cyan}Saves folder:${c.reset} ${savesFolder}\n`);

    const saves = listSaves(savesFolder);
    if (saves.length === 0) {
      console.error(`${c.red}No dynasty saves found in ${savesFolder}${c.reset}`);
      process.exit(1);
    }

    if (positional.length > 0) {
      const match = saves.find(s => s.toLowerCase() === positional[0].toLowerCase());
      if (!match) {
        console.error(`${c.red}Save "${positional[0]}" not found.${c.reset} Available: ${saves.join(', ')}`);
        process.exit(1);
      }
      savePath = path.join(savesFolder, match);
    } else {
      console.log(`${c.bold}Available saves:${c.reset}`);
      saves.forEach((s, i) => console.log(`  ${c.cyan}${i + 1}.${c.reset} ${s}`));
      console.log();

      const choice = await askChoice(`Pick a save (1-${saves.length}): `, saves.length);
      if (choice < 0) {
        console.error(`${c.red}Invalid choice.${c.reset}`);
        process.exit(1);
      }
      savePath = path.join(savesFolder, saves[choice]);
    }
  }

  console.log(`${c.cyan}Save:${c.reset} ${savePath}\n`);
  console.log(`${c.dim}Loading save file (this may take a moment)...${c.reset}\n`);

  const { setCoachXP } = require('./engine/rg/applyClass');
  const result = await setCoachXP(savePath, { dryRun });

  // ── Results ──────────────────────────────────────────────────────────────
  console.log(`${c.bold}Results${c.reset}`);
  console.log(`${c.dim}───────${c.reset}`);
  console.log(`  Previous speed: ${result.previousSpeed ?? c.dim + '(unset)' + c.reset}`);
  console.log(`  New speed:      ${c.green}${result.newSpeed}${c.reset}`);

  if (result.dryRun) {
    console.log(`\n${c.yellow}DRY RUN — no changes written to save file.${c.reset}`);
  } else {
    console.log(`\n${c.green}Save written.${c.reset}`);
    if (result.backup) console.log(`${c.dim}Backup: ${result.backup}${c.reset}`);
  }

  if (verbose) {
    console.log(`\n${c.bold}Details${c.reset}`);
    console.log(`${c.dim}──────────────────────────────${c.reset}`);
    console.log(`  ${c.dim}savePath=${savePath}${c.reset}`);
    console.log(`  ${c.dim}dryRun=${result.dryRun}${c.reset}`);
  }

  console.log();
}

main().catch(err => {
  console.error(`\n${c.red}Error: ${err.message || err}${c.reset}`);
  if (verbose) console.error(err.stack);
  process.exit(1);
});
