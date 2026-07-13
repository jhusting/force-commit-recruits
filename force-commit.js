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
  console.log(`\n${c.bold}CFB27 Force Commit — Available Recruits${c.reset}`);
  console.log(`${c.dim}────────────────────────────────────────${c.reset}\n`);

  if (dryRun) console.log(`${c.yellow}DRY RUN${c.reset} — no changes will be written\n`);

  // Set up schema path before requiring engine modules
  const engineData = path.resolve(__dirname, 'engine-data');
  process.env.RG_SCHEMA_DIR = engineData;

  const savePath = await resolveSavePath(positional, c);

  console.log(`${c.cyan}Save:${c.reset} ${savePath}\n`);
  console.log(`${c.dim}Loading save file (this may take a moment)...${c.reset}\n`);

  const { forceCommitClass } = require('./engine/rg/applyClass');
  const result = await forceCommitClass(savePath, { dryRun });

  // ── Results ──────────────────────────────────────────────────────────────
  console.log(`${c.bold}Results${c.reset}`);
  console.log(`${c.dim}───────${c.reset}`);
  console.log(`  Committed:         ${c.green}${result.committed}${c.reset}`);
  console.log(`  Charity commits (Recruits that went to a lower school than usual):   ${c.green}${result.charityCommits}${c.reset}`);
  console.log(`  Still needy:       ${result.stillNeedy}`);
  console.log(`  Remaining recruits:${c.dim} ${result.skipped}${c.reset}`);
  console.log(`  Week:              ${result.currentWeek}`);

  if (result.byPositionGroup && Object.keys(result.byPositionGroup).length > 0) {
    console.log(`\n  ${c.bold}By position group:${c.reset}`);
    for (const [group, count] of Object.entries(result.byPositionGroup)) {
      console.log(`    ${group.replace('TEAM_RATING', '')}: ${count}`);
    }
  }

  if (result.skippedSchools && result.skippedSchools.length > 0) {
    console.log(`\n  ${c.yellow}Skipped schools (ran out of target slots):${c.reset} ${result.skippedSchools.join(', ')}`);
  }

  if (result.dryRun) {
    console.log(`\n${c.yellow}DRY RUN — no changes written to save file.${c.reset}`);
  } else {
    console.log(`\n${c.green}Save written.${c.reset}`);
    if (result.backup) console.log(`${c.dim}Backup: ${result.backup}${c.reset}`);
  }

  if (verbose && result.debugLog && result.debugLog.length > 0) {
    console.log(`\n${c.bold}Debug Log (${result.debugLog.length} lines)${c.reset}`);
    console.log(`${c.dim}──────────────────────────────${c.reset}`);
    for (const line of result.debugLog) console.log(`  ${c.dim}${line}${c.reset}`);
  }

  console.log();
}

main().catch(err => {
  console.error(`\n${c.red}Error: ${err.message || err}${c.reset}`);
  if (verbose) console.error(err.stack);
  process.exit(1);
});
