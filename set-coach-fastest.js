#!/usr/bin/env node
const path = require('path');
const { resolveSavePath } = require('./savePicker');

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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}CFB27 Set Coach XP — Fastest${c.reset}`);
  console.log(`${c.dim}────────────────────────────${c.reset}\n`);

  if (dryRun) console.log(`${c.yellow}DRY RUN${c.reset} — no changes will be written\n`);

  // Set up schema path before requiring engine modules
  const engineData = path.resolve(__dirname, 'engine-data');
  process.env.RG_SCHEMA_DIR = engineData;

  const savePath = await resolveSavePath(positional, c);

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
