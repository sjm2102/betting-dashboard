// update_roster.js — back to playertotals with full debug
const fs = require('fs');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  // Fetch first page sorted by points to get SGA at top
  const test = await fetchJSON(
    'https://api.server.nbaapi.com/api/playertotals?page=1&pageSize=5&season=2025&isPlayoff=false&sortBy=points&ascending=false'
  );

  console.log('=== RAW TOP 5 PLAYERS ===');
  (test.data || []).forEach(p => {
    console.log(JSON.stringify(p));
  });

  // Now fetch all pages and build roster using per-game averages
  const roster = {};
  let page = 1;
  let totalPages = test.pagination?.pages || 1;

  // Process first page
  for (const p of (test.data || [])) {
    addPlayer(roster, p);
  }

  // Fetch remaining pages
  for (page = 2; page <= totalPages; page++) {
    const data = await fetchJSON(
      `https://api.server.nbaapi.com/api/playertotals?page=${page}&pageSize=100&season=2025&isPlayoff=false`
    );
    for (const p of (data.data || [])) addPlayer(roster, p);
    process.stdout.write(`\rPage ${page}/${totalPages}...`);
  }
  console.log('');

  const count = Object.keys(roster).length;
  console.log(`Built ${count} players`);
  if (count < 50) throw new Error(`Only ${count} — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!');
}

function addPlayer(roster, p) {
  if (!p.playerName) return;
  const gp = parseInt(p.games) || parseInt(p.gamesPlayed) || 0;
  if (gp < 3) return;
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

main().catch(e => { console.error('❌', e.message); process.exit(1); });
