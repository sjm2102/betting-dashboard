// update_roster.js
// Fetches NBA stats from ESPN's public API — no key, no CORS issues
const fs = require('fs');

const TEAM_IDS = [
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
  16,17,18,19,20,21,22,23,24,25,26,27,28,29,30
];

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Node.js roster-updater' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log('Fetching NBA stats from ESPN...');
  const roster = {};
  let totalPlayers = 0;

  for (const teamId of TEAM_IDS) {
    try {
      const url = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster?enable=stats`;
      const data = await fetchJSON(url);
      const team = data.team?.abbreviation || '';
      const athletes = data.athletes || [];

      for (const group of athletes) {
        const items = group.items || (group.athlete ? [group] : []);
        for (const item of items) {
          const athlete = item.athlete || item;
          const stats = item.statistics?.splits?.categories || [];
          const name = athlete.displayName || `${athlete.firstName} ${athlete.lastName}`;
          if (!name) continue;

          // Find general stats category
          let ppg = 0, rpg = 0, apg = 0, mpg = 0, gp = 0;
          for (const cat of stats) {
            const names = cat.names || [];
            const values = cat.values || [];
            names.forEach((n, i) => {
              const v = parseFloat(values[i]) || 0;
              if (n === 'avgPoints') ppg = v;
              if (n === 'avgRebounds') rpg = v;
              if (n === 'avgAssists') apg = v;
              if (n === 'avgMinutes') mpg = v;
              if (n === 'gamesPlayed') gp = v;
            });
          }

          roster[name] = {
            team,
            pos: athlete.position?.abbreviation || '',
            ppg: +ppg.toFixed(1),
            rpg: +rpg.toFixed(1),
            apg: +apg.toFixed(1),
            mpg: +mpg.toFixed(1),
            usg: 0,
            gp
          };
          totalPlayers++;
        }
      }
      process.stdout.write('.');
    } catch (e) {
      console.warn(`\nSkipped team ${teamId}: ${e.message}`);
    }
  }

  console.log(`\nBuilt ${totalPlayers} players`);
  if (totalPlayers < 50) throw new Error(`Only ${totalPlayers} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
