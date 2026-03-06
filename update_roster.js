// update_roster.js — ESPN NBA, correct athlete stats endpoint
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      const rosterData = await fetchJSON(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`
      );

      // Athletes come back as flat array or grouped — handle both
      let athletes = rosterData.athletes || [];
      // If grouped (guards/forwards/centers), flatten
      if (athletes.length > 0 && athletes[0].items) {
        athletes = athletes.flatMap(g => g.items || []);
      }

      for (const athlete of athletes) {
        const id = athlete.id;
        const name = athlete.fullName || athlete.displayName;
        if (!id || !name) continue;

        let ppg=0, rpg=0, apg=0, mpg=0, gp=0;
        try {
          const statsData = await fetchJSON(
            `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/stats`
          );
          // Find the "splits" for current regular season
          const categories = statsData?.splits?.categories || [];
          for (const cat of categories) {
            const names = cat.names || [];
            const values = cat.values || [];
            names.forEach((n, i) => {
              const v = parseFloat(values[i]) || 0;
              if (n === 'avgPoints')    ppg = v;
              if (n === 'avgRebounds')  rpg = v;
              if (n === 'avgAssists')   apg = v;
              if (n === 'avgMinutes')   mpg = v;
              if (n === 'gamesPlayed')  gp  = parseInt(values[i]) || 0;
            });
          }
        } catch(_) { /* player has no stats yet */ }

        roster[name] = {
          team: team.abbreviation,
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
      console.log(`✓ ${team.abbreviation} (${athletes.length})`);
    } catch(e) {
      console.warn(`Skipped ${team.abbreviation}: ${e.message}`);
    }
  }

  console.log(`\nBuilt ${totalPlayers} players`);
  const sample = Object.entries(roster).find(([,v]) => v.ppg > 0);
  if (sample) console.log('Sample:', sample[0], JSON.stringify(sample[1]));
  else console.warn('⚠️ No players had ppg > 0 — stats may not be parsing correctly');

  if (totalPlayers < 50) throw new Error(`Only ${totalPlayers} — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!', totalPlayers, 'players written');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
