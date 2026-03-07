// log_bets.js — runs every morning via GitHub Actions
// Fetches all props from The Odds API Worker, runs edge algorithm,
// logs ALL positive-edge bets to bets.json
const fs = require('fs');

const WORKER_URL = 'https://odds-proxy.stevenmcgraw89.workers.dev';
const MARKETS = ['player_points','player_rebounds','player_assists','player_points_rebounds_assists'];
const DVP_BONUS = { A: -0.08, B: -0.04, C: 0, D: 0.04, F: 0.10 };

// ── Math helpers ──────────────────────────────────────────────
function impliedProb(american) {
  return american < 0 ? (-american) / (-american + 100) : 100 / (american + 100);
}
function profitPerUnit(american) {
  return american > 0 ? american / 100 : 100 / (-american);
}
function ev1u(pWin, american) {
  return pWin * profitPerUnit(american) - (1 - pWin);
}
function vigFreeProb(o, u) {
  const po = impliedProb(o), pu = impliedProb(u), tot = po + pu;
  return [po / tot, pu / tot];
}

// ── Load roster & DVP ─────────────────────────────────────────
const roster = JSON.parse(fs.readFileSync('roster.json', 'utf8'));

// DVP tables — exact copy from index_v3.html
const DVP = {
  PG_grade: { ATL:'C',BKN:'A',BOS:'A',CHA:'B',CHI:'B',CLE:'C',DAL:'B',DEN:'C',DET:'A',GS:'C',HOU:'B',IND:'D',LAC:'C',LAL:'C',MEM:'C',MIA:'C',MIL:'F',MIN:'D',NO:'D',NY:'A',OKC:'A',ORL:'F',PHI:'C',PHO:'B',POR:'D',SA:'C',SAC:'C',TOR:'F',UTA:'D',WAS:'D' },
  SG_grade: { ATL:'F',BKN:'C',BOS:'A',CHA:'A',CHI:'B',CLE:'B',DAL:'F',DEN:'A',DET:'D',GS:'C',HOU:'A',IND:'B',LAC:'C',LAL:'D',MEM:'C',MIA:'D',MIL:'B',MIN:'A',NO:'F',NY:'D',OKC:'C',ORL:'B',PHI:'C',PHO:'B',POR:'C',SA:'C',SAC:'D',TOR:'C',UTA:'F',WAS:'D' },
  SF_grade: { ATL:'F',BKN:'D',BOS:'B',CHA:'B',CHI:'D',CLE:'C',DAL:'A',DEN:'D',DET:'B',GS:'C',HOU:'C',IND:'C',LAC:'C',LAL:'F',MEM:'F',MIA:'C',MIL:'C',MIN:'A',NO:'F',NY:'C',OKC:'A',ORL:'B',PHI:'C',PHO:'C',POR:'B',SA:'A',SAC:'C',TOR:'A',UTA:'D',WAS:'F' },
  PF_grade: { ATL:'C',BKN:'D',BOS:'C',CHA:'D',CHI:'F',CLE:'C',DAL:'D',DEN:'C',DET:'B',GS:'A',HOU:'A',IND:'C',LAC:'A',LAL:'C',MEM:'D',MIA:'C',MIL:'C',MIN:'D',NO:'B',NY:'B',OKC:'A',ORL:'C',PHI:'C',PHO:'A',POR:'C',SA:'B',SAC:'F',TOR:'B',UTA:'F',WAS:'F' },
  C_grade:  { ATL:'C',BKN:'C',BOS:'B',CHA:'D',CHI:'D',CLE:'C',DAL:'F',DEN:'D',DET:'A',GS:'C',HOU:'B',IND:'D',LAC:'C',LAL:'A',MEM:'C',MIA:'C',MIL:'B',MIN:'C',NO:'F',NY:'A',OKC:'A',ORL:'A',PHI:'B',PHO:'C',POR:'F',SA:'C',SAC:'F',TOR:'B',UTA:'D',WAS:'F' },
};
const TEAM_TO_DVP = {
  'Atlanta Hawks':'ATL','Boston Celtics':'BOS','Brooklyn Nets':'BKN','Charlotte Hornets':'CHA',
  'Chicago Bulls':'CHI','Cleveland Cavaliers':'CLE','Dallas Mavericks':'DAL','Denver Nuggets':'DEN',
  'Detroit Pistons':'DET','Golden State Warriors':'GS','Houston Rockets':'HOU','Indiana Pacers':'IND',
  'Los Angeles Clippers':'LAC','Los Angeles Lakers':'LAL','Memphis Grizzlies':'MEM','Miami Heat':'MIA',
  'Milwaukee Bucks':'MIL','Minnesota Timberwolves':'MIN','New Orleans Pelicans':'NO','New York Knicks':'NY',
  'Oklahoma City Thunder':'OKC','Orlando Magic':'ORL','Philadelphia 76ers':'PHI','Phoenix Suns':'PHO',
  'Portland Trail Blazers':'POR','Sacramento Kings':'SAC','San Antonio Spurs':'SA','Toronto Raptors':'TOR',
  'Utah Jazz':'UTA','Washington Wizards':'WAS'
};

function getPlayerStats(name) {
  return roster[name] || null;
}
function getPlayerPos(name) {
  return roster[name]?.pos || null;
}

// ── Edge algorithm ────────────────────────────────────────────
function runEdgeAlgorithm(allPropsData) {
  const results = [];

  for (const cat of MARKETS) {
    allPropsData.forEach(({ eventData, homeTeam, awayTeam }) => {
      if (!eventData?.bookmakers) return;

      const playerMap = {};
      eventData.bookmakers.forEach(book => {
        book.markets?.forEach(market => {
          if (market.key !== cat) return;
          market.outcomes?.forEach(outcome => {
            const nameLC = (outcome.name || '').toLowerCase();
            const side = nameLC === 'over' ? 'over' : nameLC === 'under' ? 'under' : null;
            if (!side) return;
            const playerName = (outcome.description || '').trim();
            if (!playerName) return;
            if (!playerMap[playerName]) playerMap[playerName] = { player: playerName, line: outcome.point, books: {}, homeTeam, awayTeam };
            if (!playerMap[playerName].books[book.key]) playerMap[playerName].books[book.key] = {};
            playerMap[playerName].books[book.key][side] = outcome.price;
            if (outcome.point !== undefined && playerMap[playerName].line === undefined) playerMap[playerName].line = outcome.point;
          });
        });
      });

      Object.values(playerMap).forEach(prop => {
        let bestOver = null, bestOverBook = null, bestUnder = null, bestUnderBook = null;
        Object.keys(prop.books).forEach(bk => {
          const o = prop.books[bk].over, u = prop.books[bk].under;
          if (o !== undefined && (bestOver === null || o > bestOver)) { bestOver = o; bestOverBook = bk; }
          if (u !== undefined && (bestUnder === null || u > bestUnder)) { bestUnder = u; bestUnderBook = bk; }
        });
        if (bestOver === null || bestUnder === null) return;

        const [pOver, pUnder] = vigFreeProb(bestOver, bestUnder);
        const evOver  = ev1u(pOver, bestOver);
        const evUnder = ev1u(pUnder, bestUnder);

        const playerStats = getPlayerStats(prop.player);
        const playerPos   = getPlayerPos(prop.player);
        const playerTeam  = playerStats?.team?.toLowerCase();
        const homeAbbr    = TEAM_TO_DVP[prop.homeTeam];
        const awayAbbr    = TEAM_TO_DVP[prop.awayTeam];
        let oppAbbr = awayAbbr;
        if (playerTeam && homeAbbr) {
          const homeMatch = prop.homeTeam.toLowerCase().includes(playerTeam) || homeAbbr.toLowerCase() === playerTeam;
          oppAbbr = homeMatch ? awayAbbr : homeAbbr;
        }
        const dvpGrade = playerPos && oppAbbr ? DVP[playerPos + '_grade']?.[oppAbbr] : null;
        const dvpBonus = DVP_BONUS[dvpGrade] || 0;

        let seasonAvg = null;
        if (playerStats) {
          if (cat === 'player_points_rebounds_assists') {
            const p = playerStats.ppg||0, r = playerStats.rpg||0, a = playerStats.apg||0;
            if (p||r||a) seasonAvg = p + r + a;
          } else {
            const statKey = { player_points:'ppg', player_rebounds:'rpg', player_assists:'apg' }[cat];
            seasonAvg = playerStats[statKey] || null;
          }
        }

        let lineAvgBonusOver = 0, lineAvgBonusUnder = 0;
        if (seasonAvg && prop.line) {
          const diff = (seasonAvg - prop.line) / seasonAvg;
          lineAvgBonusOver  = Math.max(-0.15, Math.min(0.15,  diff * 0.5));
          lineAvgBonusUnder = Math.max(-0.15, Math.min(0.15, -diff * 0.5));
        }

        const mpg = playerStats?.mpg || 0;
        const mpgBonus = Math.max(0, Math.min(0.06, (mpg - 20) / 16 * 0.06));
        const usg = playerStats?.usg || 0;
        const usgBonus = Math.max(0, Math.min(0.06, (usg - 15) / 20 * 0.06));

        const overScore  = evOver  + dvpBonus + lineAvgBonusOver  + mpgBonus + usgBonus;
        const underScore = evUnder - dvpBonus + lineAvgBonusUnder + mpgBonus + usgBonus;

        const catLabel = { player_points:'PTS', player_rebounds:'REB', player_assists:'AST', player_points_rebounds_assists:'PRA' }[cat];
        const gameLabel = `${prop.awayTeam.split(' ').pop()} @ ${prop.homeTeam.split(' ').pop()}`;
        const today = new Date().toISOString().slice(0,10);

        if (overScore > 0) {
          results.push({
            id: `${today}_${prop.player}_${cat}_OVER`,
            date: today, player: prop.player, side: 'OVER', line: prop.line,
            market: catLabel, cat, game: gameLabel,
            odds: bestOver, book: bestOverBook,
            edgeScore: +overScore.toFixed(4), ev: +evOver.toFixed(4),
            dvpGrade, dvpBonus: +dvpBonus.toFixed(4),
            seasonAvg: seasonAvg ? +seasonAvg.toFixed(1) : null,
            mpg, usg, result: 'PENDING', actualStat: null
          });
        }
        if (underScore > 0) {
          results.push({
            id: `${today}_${prop.player}_${cat}_UNDER`,
            date: today, player: prop.player, side: 'UNDER', line: prop.line,
            market: catLabel, cat, game: gameLabel,
            odds: bestUnder, book: bestUnderBook,
            edgeScore: +underScore.toFixed(4), ev: +evUnder.toFixed(4),
            dvpGrade, dvpBonus: +(-dvpBonus).toFixed(4),
            seasonAvg: seasonAvg ? +seasonAvg.toFixed(1) : null,
            mpg, usg, result: 'PENDING', actualStat: null
          });
        }
      });
    });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('📡 Fetching today\'s games...');

  // 1. Get today's game IDs
  const oddsRes = await fetch(`${WORKER_URL}?regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings`);
  if (!oddsRes.ok) throw new Error(`Odds fetch failed: ${oddsRes.status}`);
  const oddsData = await oddsRes.json();
  const games = Array.isArray(oddsData) ? oddsData : oddsData.data || [];

  if (!games.length) { console.log('No games today — nothing to log.'); return; }
  console.log(`Found ${games.length} games`);

  // 2. Fetch props for all games (batch endpoint)
  const eventIds = games.map(g => g.id).join(',');
  const markets = MARKETS.join(',');
  const batchUrl = `${WORKER_URL}?eventIds=${eventIds}&markets=${markets}&oddsFormat=american`;

  console.log('📡 Fetching props...');
  const batchRes = await fetch(batchUrl);
  if (!batchRes.ok) throw new Error(`Props fetch failed: ${batchRes.status}`);
  const batchData = await batchRes.json();

  const allPropsData = [];
  if (Array.isArray(batchData) && batchData[0]?.id !== undefined) {
    batchData.forEach(({ id, data }) => {
      const game = games.find(g => g.id === id);
      if (!data || !game) return;
      const eventObj = Array.isArray(data) ? data[0] : data;
      if (eventObj?.bookmakers?.length) {
        allPropsData.push({ eventData: eventObj, homeTeam: game.home_team, awayTeam: game.away_team });
      }
    });
  } else {
    // fallback sequential
    for (const game of games) {
      try {
        const res = await fetch(`${WORKER_URL}?eventId=${game.id}&markets=${markets}&oddsFormat=american`);
        if (!res.ok) continue;
        const data = await res.json();
        const eventObj = Array.isArray(data) ? data[0] : data;
        if (eventObj?.bookmakers?.length) {
          allPropsData.push({ eventData: eventObj, homeTeam: game.home_team, awayTeam: game.away_team });
        }
      } catch(e) { console.warn('Skip:', game.home_team, e.message); }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`Props loaded for ${allPropsData.length} games`);

  // 3. Run edge algorithm
  const newBets = runEdgeAlgorithm(allPropsData);
  console.log(`Found ${newBets.length} positive-edge bets`);

  // 4. Merge with existing bets.json (avoid duplicates by id)
  let existing = [];
  if (fs.existsSync('bets.json')) {
    existing = JSON.parse(fs.readFileSync('bets.json', 'utf8'));
  }
  const existingIds = new Set(existing.map(b => b.id));
  const added = newBets.filter(b => !existingIds.has(b.id));
  const merged = [...existing, ...added];
  fs.writeFileSync('bets.json', JSON.stringify(merged, null, 2));
  console.log(`✅ Added ${added.length} new bets. Total: ${merged.length}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
