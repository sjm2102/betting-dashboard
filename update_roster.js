// update_roster.js — uses ESPN scoreboard/athlete stats API
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log('Fetching NBA teams...');
  const teamsData = await fetchJSON(
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=32'
  );
  const teams = teamsData.sports[0].leagues[0].teams.map(t => t.team);
  console.log(`Got ${teams.length} teams`);

  const roster = {};
  let totalPlayers = 0;

  for (const team of teams) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`;
      const data = await fetchJSON(url);
      const abbr = team.abbreviation;

      const athletes = data.athletes || [];
      for (const athlete of athletes) {
        const name = athlete.displayName;
        if (!name) continue;

        // Pull season stats from athlete detail
        const statsUrl = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athlete.id}/stats`;
        try {
          const statsData = await fetchJSON(statsUrl);
          const splits = statsData.splits?.categories || [];
          let ppg=0, rpg=0, apg=0, mpg=0, gp=0;
          for (const cat of splits) {
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
            team: abbr, pos: athlete.position?.abbreviation || '',
            ppg: +ppg.toFixed(1), rpg: +rpg.toFixed(1),
            apg: +apg.toFixed(1), mpg: +mpg.toFixed(1),
            usg: 0, gp
          };
          totalPlayers++;
        } catch(e) {
          // Player has no stats yet — still add to roster with zeros
          roster[name] = {
            team: abbr, pos: athlete.position?.abbreviation || '',
            ppg: 0, rpg: 0, apg: 0, mpg: 0, usg: 0, gp: 0
          };
          totalPlayers++;
        }
      }
      console.log(`✓ ${abbr} (${athletes.length} players)`);
    } catch(e) {
      console.warn(`Skipped ${team.abbreviation}: ${e.message}`);
    }
  }

  console.log(`\nBuilt ${totalPlayers} players`);
  if (totalPlayers < 50) throw new Error(`Only ${totalPlayers} — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
