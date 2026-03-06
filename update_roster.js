// update_roster.js
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const roster = {};
  let page = 1;
  let totalPages = 1;

  console.log('Fetching NBA player stats...');

  while (page <= totalPages) {
    const url = `https://api.server.nbaapi.com/api/playertotals?page=${page}&pageSize=100&season=2025&isPlayoff=false`;
    const data = await fetchJSON(url);
    totalPages = data.pagination?.pages || 1;

    for (const p of (data.data || [])) {
      if (!p.playerName) continue;
      const gp = parseInt(p.games) || 0;
      if (gp < 3) continue;

      // Divide all totals by games played to get per-game averages
      roster[p.playerName] = {
        team: p.team || '',
        pos: p.position || '',
        ppg: +(parseFloat(p.points||0) / gp).toFixed(1),
        rpg: +(parseFloat(p.totalRb||0) / gp).toFixed(1),
        apg: +(parseFloat(p.assists||0) / gp).toFixed(1),
        mpg: +(parseFloat(p.minutesPg||0) / gp).toFixed(1),
        usg: 0,
        gp
      };
    }
    console.log(`Page ${page}/${totalPages}`);
    page++;
  }

  const count = Object.keys(roster).length;
  console.log(`\nBuilt ${count} players`);

  // Sanity check — show top 5 scorers
  const top5 = Object.entries(roster)
    .sort((a,b) => b[1].ppg - a[1].ppg)
    .slice(0,5);
  console.log('Top 5 scorers:');
  top5.forEach(([n,v]) => console.log(` ${n}: ${v.ppg}ppg / ${v.rpg}rpg / ${v.apg}apg / ${v.mpg}mpg`));

  if (count < 50) throw new Error(`Only ${count} — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!', count, 'players written');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
