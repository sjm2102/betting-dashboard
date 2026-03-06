// update_roster.js — uses playerPerGameStats endpoint for true per-game averages
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

  console.log('Fetching NBA per-game stats...');

  while (page <= totalPages) {
    const url = `https://api.server.nbaapi.com/api/playerperGameStats?page=${page}&pageSize=100&season=2025`;
    const data = await fetchJSON(url);
    totalPages = data.pagination?.pages || 1;

    // Log first player raw to verify field names
    if (page === 1 && data.data?.[0]) {
      console.log('Sample raw:', JSON.stringify(data.data[0], null, 2));
    }

    for (const p of (data.data || [])) {
      if (!p.playerName) continue;
      const gp = parseInt(p.games) || 0;
      if (gp < 3) continue;

      roster[p.playerName] = {
        team: p.team || '',
        pos: p.position || '',
        ppg: +parseFloat(p.points || 0).toFixed(1),
        rpg: +parseFloat(p.totalRb || 0).toFixed(1),
        apg: +parseFloat(p.assists || 0).toFixed(1),
        mpg: +parseFloat(p.minutesPg || 0).toFixed(1),
        usg: 0,
        gp
      };
    }
    console.log(`Page ${page}/${totalPages}`);
    page++;
  }

  const count = Object.keys(roster).length;
  console.log(`\nBuilt ${count} players`);

  const top3 = Object.entries(roster)
    .sort((a,b) => b[1].ppg - a[1].ppg)
    .slice(0,3);
  console.log('Top 3:', top3.map(([n,v]) => `${n}: ${v.ppg}ppg ${v.rpg}rpg ${v.apg}apg`).join(' | '));

  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!', count, 'players written');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
