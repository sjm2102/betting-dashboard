// resolve_bets.js — runs every night after games finish (11:30PM ET)
// Fetches ESPN box scores and auto-resolves all PENDING bets as TRUE or FALSE
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function nameFuzzyMatch(a, b) {
  const c = s => s.toLowerCase().replace(/[^a-z]/g, '');
  return c(a) === c(b) || c(a).includes(c(b)) || c(b).includes(c(a));
}

// Fetch a player's actual stat for a given game date from ESPN box scores
async function fetchPlayerStat(playerName, cat, date) {
  const d = date.replace(/-/g, '');
  const sb = await fetchJSON(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&limit=20`
  );

  for (const event of (sb.events || [])) {
    // Only check completed games
    const status = event.status?.type?.completed;
    if (!status) continue;

    try {
      const box = await fetchJSON(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${event.id}`
      );

      for (const team of (box.boxscore?.players || [])) {
        for (const grp of (team.statistics || [])) {
          for (const ath of (grp.athletes || [])) {
            if (!nameFuzzyMatch(ath.athlete?.displayName || '', playerName)) continue;

            const labels = grp.labels || [];
            const stats  = ath.stats  || [];
            const get = label => {
              const i = labels.indexOf(label);
              return i >= 0 ? parseFloat(stats[i]) || 0 : null;
            };

            if (cat === 'player_points_rebounds_assists') {
              const pts = get('PTS'), reb = get('REB'), ast = get('AST');
              if (pts === null) continue;
              return { stat: (pts||0)+(reb||0)+(ast||0), breakdown: `${pts}pts/${reb}reb/${ast}ast` };
            }

            const labelMap = {
              player_points: 'PTS', player_rebounds: 'REB',
              player_assists: 'AST', player_steals: 'STL', player_blocks: 'BLK'
            };
            const val = get(labelMap[cat]);
            if (val === null) continue;
            return { stat: val, breakdown: `${val} ${labelMap[cat]}` };
          }
        }
      }
    } catch(e) {
      console.warn(`  Box score error for event ${event.id}:`, e.message);
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync('bets.json')) {
    console.log('No bets.json found — nothing to resolve.');
    return;
  }

  const bets = JSON.parse(fs.readFileSync('bets.json', 'utf8'));
  const pending = bets.filter(b => b.result === 'PENDING');

  if (!pending.length) {
    console.log('No pending bets to resolve.');
    return;
  }

  console.log(`Resolving ${pending.length} pending bets...`);
  let resolved = 0, stillPending = 0;

  for (const bet of pending) {
    try {
      const result = await fetchPlayerStat(bet.player, bet.cat, bet.date);
      if (result === null) {
        console.log(`  ⏳ ${bet.player} — game not found/not final yet`);
        stillPending++;
        continue;
      }

      bet.actualStat = result.stat;
      bet.breakdown  = result.breakdown;
      const hit = bet.side === 'OVER' ? result.stat > bet.line : result.stat < bet.line;
      bet.result = hit ? 'TRUE' : 'FALSE';
      resolved++;
      console.log(`  ${hit ? '✅' : '❌'} ${bet.player} ${bet.side} ${bet.line} ${bet.market} → actual: ${result.breakdown} → ${bet.result}`);

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      console.warn(`  ⚠️  Error resolving ${bet.player}:`, e.message);
      stillPending++;
    }
  }

  fs.writeFileSync('bets.json', JSON.stringify(bets, null, 2));
  console.log(`\n✅ Resolved ${resolved} bets. ${stillPending} still pending.`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
