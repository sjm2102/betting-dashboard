// update_roster.js — divides totals by games to get per-game averages
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

      // API returns season totals — divide by games for per-game averages
      const ppg = gp > 0 ? parseFloat(p.points) / gp : 0;
      const rpg = gp > 0 ? parseFloat(p.totalRb) / gp : 0;
      const apg = gp > 0 ? parseFloat(p.assists) / gp : 0;
      // minutesPg appears to already be per-game based on field name
      const mpg = parseFloat(p.minutesPg) || 0;

      roster[p.playerName] = {
        team: p.team || '',
        pos: p.position || '',
        ppg: +ppg.toFixed(1),
        rpg: +rpg.toFixed(1),
        apg: +apg.toFixed(1),
        mpg: +mpg.toFixed(1),
        usg: 0,
        gp
      };
    }
    console.log(`Page ${page}/${totalPages}`);
    page++;
  }

  const count = Object.keys(roster).length;
  console.log(`Built ${count} players`);

  // Log top scorers as sanity check
  const top3 = Object.entries(roster)
    .sort((a,b) => b[1].ppg - a[1].ppg)
    .slice(0,3);
  console.log('Top 3 scorers:', top3.map(([n,v]) => `${n}: ${v.ppg}ppg`).join(', '));

  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!', count, 'players written');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
