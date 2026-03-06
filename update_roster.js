// update_roster.js — with full debug output
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  // First, fetch just 1 player to see the exact structure
  console.log('Testing API structure...');
  const test = await fetchJSON(
    'https://api.server.nbaapi.com/api/playertotals?page=1&pageSize=3&season=2025&isPlayoff=false&sortBy=points&ascending=false'
  );
  console.log('Raw sample:', JSON.stringify(test.data?.[0], null, 2));
  console.log('Pagination:', JSON.stringify(test.pagination));

  const roster = {};
  let page = 1;
  let totalPages = test.pagination?.pages || 1;

  // Process first page already fetched
  for (const p of (test.data || [])) {
    if (!p.playerName || (p.games || 0) < 3) continue;
    roster[p.playerName] = {
      team: p.team || '',
      pos: p.position || '',
      ppg: +parseFloat(p.points || 0).toFixed(1),
      rpg: +parseFloat(p.totalRb || 0).toFixed(1),
      apg: +parseFloat(p.assists || 0).toFixed(1),
      mpg: +parseFloat(p.minutesPg || 0).toFixed(1),
      usg: 0,
      gp: p.games || 0
    };
  }

  // Fetch remaining pages
  for (page = 2; page <= totalPages; page++) {
    const url = `https://api.server.nbaapi.com/api/playertotals?page=${page}&pageSize=100&season=2025&isPlayoff=false`;
    const data = await fetchJSON(url);
    for (const p of (data.data || [])) {
      if (!p.playerName || (p.games || 0) < 3) continue;
      roster[p.playerName] = {
        team: p.team || '',
        pos: p.position || '',
        ppg: +parseFloat(p.points || 0).toFixed(1),
        rpg: +parseFloat(p.totalRb || 0).toFixed(1),
        apg: +parseFloat(p.assists || 0).toFixed(1),
        mpg: +parseFloat(p.minutesPg || 0).toFixed(1),
        usg: 0,
        gp: p.games || 0
      };
    }
    console.log(`Page ${page}/${totalPages} done`);
  }

  const count = Object.keys(roster).length;
  console.log(`\nBuilt ${count} players`);
  const sample = Object.entries(roster).find(([,v]) => v.ppg > 15);
  if (sample) console.log('Top scorer sample:', sample[0], JSON.stringify(sample[1]));
  else console.warn('⚠️ No player has ppg > 15 — check raw sample above');

  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
