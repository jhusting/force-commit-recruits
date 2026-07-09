// Force-commit available recruits to needy schools in a CFB27 dynasty save.
// Matches uncommitted recruits to schools under the commit threshold, then instant-commits
// each recruit via an existing hijackable target entry on that school's board. Backup + save.
const fs = require('fs');
const { openSave, tableByName, readTable, parseRef, makeRef, sf } = require('./openSave');

const W = (rec, field, val) => { try { rec[field] = val; return true; } catch { return false; } };

// Position group mapping: individual player positions -> Team table rating fields.
// Used by forceCommitClass to translate a school's weakest TEAM_RATING* groups into the
// individual positions that fill those groups.
const POSITION_TO_RATING_GROUP = {
  CB: 'TEAM_RATINGDB', FS: 'TEAM_RATINGDB', SS: 'TEAM_RATINGDB',
  ROLB: 'TEAM_RATINGLB', LOLB: 'TEAM_RATINGLB', MLB: 'TEAM_RATINGLB',
  DT: 'TEAM_RATINGDL', LE: 'TEAM_RATINGDL', RE: 'TEAM_RATINGDL',
  TE: 'TEAM_RATINGTE',
  RT: 'TEAM_RATINGOL', LT: 'TEAM_RATINGOL', C: 'TEAM_RATINGOL', RG: 'TEAM_RATINGOL', LG: 'TEAM_RATINGOL',
  QB: 'TEAM_RATINGQB',
  WR: 'TEAM_RATINGWR',
  HB: 'TEAM_RATINGRB', FB: 'TEAM_RATINGRB',
  K: 'TEAM_RATINGST', P: 'TEAM_RATINGST',
};
const RATING_GROUPS = ['TEAM_RATINGDB', 'TEAM_RATINGLB', 'TEAM_RATINGDL', 'TEAM_RATINGTE', 'TEAM_RATINGOL', 'TEAM_RATINGQB', 'TEAM_RATINGWR', 'TEAM_RATINGRB', 'TEAM_RATINGST'];
const FINAL_THRESHOLD = 35;

// Map recruit star rating to the TeamPrestige values (0-9) they should be matched with.
// Slight overlap at boundaries so border-prestige schools can attract from adjacent tiers.
const STAR_TO_PRESTIGE_RANGE = {
  ONE_STAR:   [0, 1, 2, 3],
  TWO_STAR:   [1, 2, 3, 4, 5, 6, 7],
  THREE_STAR: [4, 5, 6, 7, 8, 9],
  FOUR_STAR:  [5, 6, 7, 8, 9],
  FIVE_STAR:  [7, 8, 9, 10],
};

/**
 * Resolve the #1 top school TeamId for a recruit record, or undefined if unresolvable.
 */
async function resolveTopSchoolTeamId(recruitRec, getT) {
  const topSchoolsRef = parseRef(sf(recruitRec, 'TopSchoolsList'));
  if (!topSchoolsRef) return undefined;
  const topSchoolsListT = await getT(topSchoolsRef.tableId);
  const topSchoolsListRec = topSchoolsListT.records[topSchoolsRef.row];
  if (!topSchoolsListRec) return undefined;
  const firstCol = topSchoolsListT.offsetTable.map((o) => o.name)[0];
  const topSchoolRef = parseRef(sf(topSchoolsListRec, firstCol));
  if (!topSchoolRef) return undefined;
  const topSchoolT = await getT(topSchoolRef.tableId);
  const topSchoolRec = topSchoolT.records[topSchoolRef.row];
  if (!topSchoolRec) return undefined;
  return sf(topSchoolRec, 'TeamId');
}

/**
 * Build a reverse lookup from TeamIndex (= RecruitTarget[] board row) to Team table row.
 * The Team table's row index and TeamIndex are NOT the same; TeamIndex is what the game uses
 * as the identifier in ProspectTargetSchool.TeamId and as the RecruitTarget[] board index.
 */
function buildTeamIndexToRow(teamT) {
  const map = {};
  const limit = teamT.header.recordCapacity;
  for (let row = 0; row < limit; row++) {
    const rec = teamT.records[row];
    if (!rec || rec.isEmpty) continue;
    const idx = +sf(rec, 'TeamIndex');
    if (Number.isFinite(idx)) map[idx] = row;
  }
  return map;
}

/**
 * Build the list of needy schools (< threshold committed recruits), sorted by PrestigeRank
 * ascending (lowest value = highest prestige = first pick). For each school, caches the weakest
 * numGroups position groups, the individual positions that fill them, and the hijackable target
 * entries available for instant-commit.
 *
 * A recruit counts as committed to this school when its RecruitStage is HardCommitted or Signed
 * AND the recruit's #1 top school TeamId matches this board's TeamIndex. All other target entries
 * are hijackable.
 *
 * @param teamIndexToRow  map from TeamIndex (board row) to Team table row
 * @param threshold   schools with fewer committed recruits than this are "needy"
 * @param numGroups   how many of the lowest TEAM_RATING* groups to consider (0 = all positions accepted)
 */
async function buildNeedySchools(recruitTargetArrayT, recruitTargetT, recruitT, teamT, getT, teamIndexToRow, threshold, numGroups) {
  const needySchools = [];
  const rtArrayLimit = recruitTargetArrayT.header.recordCapacity;
  const cols = recruitTargetArrayT.offsetTable.map((o) => o.name);

  for (let boardRow = 0; boardRow < rtArrayLimit; boardRow++) {
    const arrayRec = recruitTargetArrayT.records[boardRow];
    if (!arrayRec || arrayRec.isEmpty) continue;

    const teamTableRow = teamIndexToRow[boardRow];
    if (teamTableRow === undefined) continue;
    const teamRec = teamT.records[teamTableRow];
    if (!teamRec || teamRec.isEmpty) continue;

    let committedCount = 0;
    const hijackableTargets = [];
    let isUserSchool = false;

    for (const col of cols) {
      const targetRef = parseRef(sf(arrayRec, col));
      if (!targetRef) continue;
      if (targetRef.tableId !== recruitTargetT.header.tableId) {
        isUserSchool = true;
        break;
      }
      const targetEntry = recruitTargetT.records[targetRef.row];
      if (!targetEntry || targetEntry.isEmpty) continue;

      const recruitRef = parseRef(sf(targetEntry, 'Recruit'));
      if (!recruitRef) { hijackableTargets.push(targetEntry); continue; }
      const recruitRec = recruitT.records[recruitRef.row];
      if (!recruitRec || recruitRec.isEmpty) { hijackableTargets.push(targetEntry); continue; }

      const stage = sf(recruitRec, 'RecruitStage') || '';
      if (stage === 'HardCommitted' || stage === 'Signed') {
        const topTeamId = await resolveTopSchoolTeamId(recruitRec, getT);
        if (+topTeamId === boardRow) {
          committedCount++;
        } else {
          hijackableTargets.push(targetEntry);
        }
      } else {
        hijackableTargets.push(targetEntry);
      }
    }

    if (isUserSchool) continue;
    if (committedCount >= threshold) continue;

    const prestigeRank = +sf(teamRec, 'PrestigeRank') || 0;
    const teamPrestige = +sf(teamRec, 'TeamPrestige') || 0;

    let neededPositions;
    if (numGroups > 0 && numGroups < RATING_GROUPS.length) {
      const ratings = RATING_GROUPS.map((g) => ({ group: g, value: +sf(teamRec, g) || 0 }));
      ratings.sort((a, b) => a.value - b.value);
      const lowestGroups = new Set(ratings.slice(0, numGroups).map((r) => r.group));
      neededPositions = new Set();
      for (const pos of Object.keys(POSITION_TO_RATING_GROUP)) {
        if (lowestGroups.has(POSITION_TO_RATING_GROUP[pos])) neededPositions.add(pos);
      }
    } else {
      neededPositions = null;
    }

    needySchools.push({
      boardRow,
      teamTableRow,
      prestigeRank,
      teamPrestige,
      committedCount,
      neededPositions,
      targetEntries: hijackableTargets,
      targetIdx: 0,
    });
  }

  needySchools.sort((a, b) => a.prestigeRank - b.prestigeRank);
  return needySchools;
}

/**
 * Build the global list of available (uncommitted) recruits, sorted by NationalRank ascending
 * (best recruits first). Each entry caches the recruit record, player record, position,
 * national rank, commit score, and TopSchoolsList ref.
 */
function buildAvailableRecruits(recruitT, playerT) {
  const recruits = [];
  const limit = recruitT.header.nextRecordToUse;
  for (let i = 0; i < limit; i++) {
    const recruitRec = recruitT.records[i];
    if (!recruitRec || recruitRec.isEmpty) continue;

    const recruitStage = sf(recruitRec, 'RecruitStage') || '';
    const scholarShipOffers = sf(recruitRec, 'TotalScholarshipOffers') || 0;
    if (scholarShipOffers > 0 || recruitStage === 'SoftCommitted' 
      || recruitStage === 'HardCommitted' 
      || recruitStage === 'Signed') continue;

    const playerRef = parseRef(sf(recruitRec, 'Player'));
    if (!playerRef || playerRef.tableId !== playerT.header.tableId) continue;
    const playerRec = playerT.records[playerRef.row];
    if (!playerRec || playerRec.isEmpty) continue;

    const position = sf(playerRec, 'Position');
    if (!position) continue;

    recruits.push({
      recruitRow: i,
      recruitRec,
      playerRec,
      position,
      starRating: sf(playerRec, 'ProspectStarRating') || 'TWO_STAR',
      nationalRank: +sf(recruitRec, 'NationalRank') || 0,
      commitScore: +sf(recruitRec, 'CommitScore') || 900,
    });
  }

  recruits.sort((a, b) => a.nationalRank - b.nationalRank);
  return recruits;
}

function sendFreeCommits(recruitTargetT) {
  const limit = recruitTargetT.header.nextRecordToUse;
  let freeCommits = 0;
  for (let i = 0; i < limit; i++) {
    const targetEntry = recruitTargetT.records[i];
    if (!targetEntry || targetEntry.isEmpty) continue;

    const recruitRef = sf(targetEntry, 'ScholarshipStatus') || 'Offered';
    if (!recruitRef || recruitRef === 'Offered') continue;

    W(targetEntry, 'OriginalNILExpectation', 0);
    W(targetEntry, 'CurrentNILOffer', 0);
    W(targetEntry, 'NILExpectation', 0);
    W(targetEntry, 'ScholarshipStatus', 'Offered');

    freeCommits++;
  }

  return freeCommits;
}

/**
 * Instant-commit a recruit to a school using an existing (uncommitted) target entry on that
 * school's board. Links the target entry to the recruit, writes commit fields, flips the
 * recruit's stage, and rewrites the recruit's #1 top school to be the committing school.
 * @returns {boolean} true if the commit was written successfully
 */
async function instantCommit(targetEntry, recruitRec, recruitRow, recruitTableId, boardRow, commitScore, currentWeek, getT) {
  W(targetEntry, 'Recruit', makeRef(recruitTableId, recruitRow));
  W(targetEntry, 'CommittedWeekNumber', currentWeek);
  W(targetEntry, 'OriginalNILExpectation', 0);
  W(targetEntry, 'CurrentNILOffer', 0);
  W(targetEntry, 'NILExpectation', 0);
  W(targetEntry, 'ScholarshipStatus', 'Offered');

  W(recruitRec, 'RecruitStage', 'HardCommitted');
  W(recruitRec, 'RecruitStageAdvance', 'InstantCommit');

  const topSchoolsRef = parseRef(sf(recruitRec, 'TopSchoolsList'));
  if (!topSchoolsRef) return false;
  const topSchoolsListT = await getT(topSchoolsRef.tableId);
  const topSchoolsListRec = topSchoolsListT.records[topSchoolsRef.row];
  if (!topSchoolsListRec) return false;
  const firstCol = topSchoolsListT.offsetTable.map((o) => o.name)[0];
  const topSchoolRef = parseRef(sf(topSchoolsListRec, firstCol));
  if (!topSchoolRef) return false;
  const topSchoolT = await getT(topSchoolRef.tableId);
  const topSchoolRec = topSchoolT.records[topSchoolRef.row];
  if (!topSchoolRec) return false;

  try { topSchoolRec.TeamId = boardRow; } catch {}
  try { topSchoolRec.TeamInfluence = commitScore; } catch {}
  return true;
}

/**
 * Fill needy schools with available recruits using prestige-matched, recruit-driven matching.
 * Iterates recruits from top (best national rank) to bottom. For each recruit, finds needy
 * schools whose TeamPrestige falls within the recruit's star-rating range, preferring schools
 * that have the recruit's position as a top-3 need and breaking ties by fewest commits.
 * @param savePath  absolute path to the dynasty save
 */
async function forceCommitClass(savePath, options = {}) {
  const file = await openSave(savePath);

  const seasonInfoT = await readTable(file, 'SeasonInfo');
  const currentWeek = +sf(seasonInfoT.records[0], 'CurrentWeek') || 1;

  const recruitTargetArrayT = await readTable(file, 'RecruitTarget[]');
  const recruitTargetT = await readTable(file, 'RecruitTarget');
  const recruitT = await readTable(file, 'Recruit');
  const playerT = tableByName(file, 'Player'); await playerT.readRecords();
  const teamT = await readTable(file, 'Team');

  const cache = {};
  const getT = async (id) => { if (!cache[id]) { const t = file.getTableById(id); await t.readRecords(); cache[id] = t; } return cache[id]; };
  const recruitTableId = recruitT.header.tableId;

  const debugLog = [];
  let totalCommitted = 0;
  const skippedSchoolSet = new Set();
  const byPositionGroup = {};

  const teamIndexToRow = buildTeamIndexToRow(teamT);
  const needySchools = await buildNeedySchools(recruitTargetArrayT, recruitTargetT, recruitT, teamT, getT, teamIndexToRow, FINAL_THRESHOLD, 3);
  const availableRecruits = buildAvailableRecruits(recruitT, playerT);

  for (const s of needySchools) {
    const needsStr = s.neededPositions ? `[${[...s.neededPositions]}]` : '[ANY]';
    debugLog.push(`[needy] board=${s.boardRow} prestige=${s.teamPrestige} committed=${s.committedCount} hijackable=${s.targetEntries.length} needs=${needsStr}`);
  }

  const posCounts = {};
  for (const r of availableRecruits) posCounts[r.position] = (posCounts[r.position] || 0) + 1;
  debugLog.push(`[available] total=${availableRecruits.length} ${JSON.stringify(posCounts)}`);

  for (const recruit of availableRecruits) {
    const liveStage = sf(recruit.recruitRec, 'RecruitStage') || '';
    if (liveStage === 'HardCommitted' || liveStage === 'Signed') continue;

    const allowedPrestige = STAR_TO_PRESTIGE_RANGE[recruit.starRating];
    if (!allowedPrestige) continue;

    const prestigeSet = new Set(allowedPrestige);
    const candidates = needySchools.filter((s) =>
      s.committedCount < FINAL_THRESHOLD &&
      s.targetIdx < s.targetEntries.length &&
      prestigeSet.has(s.teamPrestige)
    );

    if (candidates.length === 0) continue;

    const posMatch = candidates.filter((s) => s.neededPositions && s.neededPositions.has(recruit.position));

    let bestSchool;
    if (posMatch.length > 0) {
      bestSchool = posMatch.reduce((a, b) => a.committedCount <= b.committedCount ? a : b);
    } else {
      bestSchool = candidates.reduce((a, b) => a.committedCount <= b.committedCount ? a : b);
    }

    const targetEntry = bestSchool.targetEntries[bestSchool.targetIdx];
    bestSchool.targetIdx++;

    const ok = await instantCommit(targetEntry, recruit.recruitRec, recruit.recruitRow, recruitTableId, bestSchool.boardRow, recruit.commitScore, currentWeek, getT);

    if (!ok) {
      debugLog.push(`[commit-fail] recruit=${recruit.recruitRow} pos=${recruit.position} star=${recruit.starRating} -> board=${bestSchool.boardRow}`);
      continue;
    }

    totalCommitted++;
    bestSchool.committedCount++;
    const group = POSITION_TO_RATING_GROUP[recruit.position];
    if (group) byPositionGroup[group] = (byPositionGroup[group] || 0) + 1;

    if (bestSchool.targetIdx >= bestSchool.targetEntries.length && bestSchool.committedCount < FINAL_THRESHOLD) {
      skippedSchoolSet.add(bestSchool.boardRow);
    }
  }

  for (const s of needySchools) {
    if (s.committedCount < FINAL_THRESHOLD) {
      debugLog.push(`[underfilled] board=${s.boardRow} prestige=${s.teamPrestige} committed=${s.committedCount}/${FINAL_THRESHOLD}`);
    }
  }

  const finalStillNeedy = needySchools.filter((s) => s.committedCount < FINAL_THRESHOLD).length;
  const finalAvailable = buildAvailableRecruits(recruitT, playerT);

  debugLog.push(`--- FINAL: ${finalStillNeedy} schools still under ${FINAL_THRESHOLD}, ${finalAvailable.length} recruits still available ---`);

  const freeCommits = sendFreeCommits(recruitTargetT);
  debugLog.push(`[number of free commits sent] ${freeCommits}`);

  let backup = null;
  if (!options.dryRun) {
    backup = `${savePath}.backup-${Date.now()}`;
    fs.copyFileSync(savePath, backup);
    await file.save();
  }
  return { committed: totalCommitted, stillNeedy: finalStillNeedy, byPositionGroup, skippedSchools: [...skippedSchoolSet], skipped: finalAvailable.length, currentWeek, backup, dryRun: !!options.dryRun, debugLog };
}

async function setCoachXP(savePath, options = {}) {
  const file = await openSave(savePath);
  const coachT = await readTable(file, 'LeagueSetting');

  const coachRec = coachT.records[0];
  if (!coachRec || coachRec.isEmpty) {
    throw new Error('LeagueSetting record not found');
  }

  const previousSpeed = sf(coachRec, 'CoachXPSpeedSetting');
  W(coachRec, 'CoachXPSpeedSetting', 'Fastest');

  let backup = null;
  if (!options.dryRun) {
    backup = `${savePath}.backup-${Date.now()}`;
    fs.copyFileSync(savePath, backup);
    await file.save();
  }

  return { previousSpeed, newSpeed: 'Fastest', backup, dryRun: !!options.dryRun };
}

module.exports = { forceCommitClass, setCoachXP };
