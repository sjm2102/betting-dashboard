// update_roster.js — ESPN NBA stats, correct endpoint structure
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log('Fetching NBA teams from ESPN...');
  const teamsData = await fetchJSON(
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=32'
  );
  const teams = teamsData.sports[0].leagues[0].teams.map(t => t.team);
  console.log(`Got ${teams.length} teams`);

  const roster = {};
  let totalPlayers = 0;

  for (const team of teams) {
    try {
      // This endpoint returns athletes WITH their season stats embedded
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`;
      const data = await fetchJSON(url);
      const abbr = team.abbreviation;

      // ESPN returns athletes in position groups: guards, forwards, centers
      const groups = data.athletes || [];
      for (const group of groups) {
        const athletes = group.items || [];
        for (const athlete of athletes) {
          const name = athlete.fullName || athlete.displayName;
          if (!name) continue;

          // Stats are in athlete.statistics array
          let ppg=0, rpg=0, apg=0, mpg=0, gp=0;
          const stats = athlete.statistics || [];
          for (const stat of stats) {
            // Each stat has a name and value
            switch(stat.name) {
              case 'avgPoints': ppg = parseFloat(stat.value)||0; break;
              case 'avgRebounds': rpg = parseFloat(stat.value)||0; break;
              case 'avgAssists': apg = parseFloat(stat.value)||0; break;
              case 'avgMinutes': mpg = parseFloat(stat.value)||0; break;
              case 'gamesPlayed': gp = parseInt(stat.value)||0; break;
            }
          }

          roster[name] = {
            team: abbr,
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
      console.log(`✓ ${abbr}`);
    } catch(e) {
      console.warn(`Skipped team ${team.abbreviation}: ${e.message}`);
    }
  }

  console.log(`\nBuilt ${totalPlayers} players`);

  // Log a sample to verify stats came through
  const sample = Object.entries(roster).find(([,v]) => v.ppg > 0);
  if (sample) console.log('Sample:', sample[0], sample[1]);

  if (totalPlayers < 50) throw new Error(`Only ${totalPlayers} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done! roster.json updated with', totalPlayers, 'players');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
