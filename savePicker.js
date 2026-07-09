const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

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

function askText(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function normalizePathInput(input) {
  const trimmed = input.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function isValidSaveFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function looksLikeFilePath(input) {
  return /[\\/]/.test(input) || path.isAbsolute(input);
}

function warnIfNotFBCHUNKS(c, savePath) {
  if (!isFBCHUNKS(savePath)) {
    console.log(`${c.yellow}Warning: file does not look like a CFB27 save (missing FBCHUNKS header). Trying anyway...${c.reset}\n`);
  }
}

async function promptForSavePath(c, reason) {
  console.log(`${c.yellow}${reason}${c.reset}`);
  console.log(`${c.dim}Enter the full path to your dynasty save file.${c.reset}\n`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const input = await askText('Save file path: ');
    const savePath = normalizePathInput(input);
    if (!isValidSaveFile(savePath)) {
      console.error(`${c.red}File not found or invalid.${c.reset} Try again.\n`);
      continue;
    }
    warnIfNotFBCHUNKS(c, savePath);
    return savePath;
  }

  return null;
}

/**
 * Resolve a dynasty save path from CLI args, auto-detection, interactive picker,
 * or a manual path prompt when saves cannot be found automatically.
 */
async function resolveSavePath(positional, c) {
  if (positional.length > 0) {
    if (looksLikeFilePath(positional[0])) {
      const resolved = normalizePathInput(positional[0]);
      if (isValidSaveFile(resolved)) {
        warnIfNotFBCHUNKS(c, resolved);
        return resolved;
      }
      const manual = await promptForSavePath(c, `Save file not found: ${positional[0]}`);
      if (!manual) throw new Error('No save file provided.');
      return manual;
    }
  }

  const savesFolder = findSavesFolder();
  if (!savesFolder) {
    const manual = await promptForSavePath(c, 'Could not auto-detect saves folder.');
    if (!manual) throw new Error('No save file provided.');
    return manual;
  }

  console.log(`${c.cyan}Saves folder:${c.reset} ${savesFolder}\n`);

  const saves = listSaves(savesFolder);
  if (saves.length === 0) {
    const manual = await promptForSavePath(c, `No dynasty saves found in ${savesFolder}`);
    if (!manual) throw new Error('No save file provided.');
    return manual;
  }

  if (positional.length > 0) {
    const match = saves.find(s => s.toLowerCase() === positional[0].toLowerCase());
    if (match) return path.join(savesFolder, match);

    const manual = await promptForSavePath(
      c,
      `Save "${positional[0]}" not found in the auto-detected folder. Available: ${saves.join(', ')}`
    );
    if (!manual) throw new Error('No save file provided.');
    return manual;
  }

  console.log(`${c.bold}Available saves:${c.reset}`);
  saves.forEach((s, i) => console.log(`  ${c.cyan}${i + 1}.${c.reset} ${s}`));
  console.log();
  console.log(`${c.dim}Or press Enter at the prompt below to type a save file path instead.${c.reset}\n`);

  const input = await askText(`Pick a save (1-${saves.length}) or press Enter for manual path: `);
  if (!input) {
    const manual = await promptForSavePath(c, 'Manual save path:');
    if (!manual) throw new Error('No save file provided.');
    return manual;
  }

  const n = parseInt(input, 10);
  if (Number.isFinite(n) && n >= 1 && n <= saves.length) {
    return path.join(savesFolder, saves[n - 1]);
  }

  const manualPath = normalizePathInput(input);
  if (isValidSaveFile(manualPath)) {
    warnIfNotFBCHUNKS(c, manualPath);
    return manualPath;
  }

  throw new Error('Invalid choice.');
}

module.exports = { resolveSavePath };
