// update_roster.js
const fs = require('fs');

const API_KEY = process.env.BALLDONTLIE_API_KEY || '';
if (!API_KEY) { console.error('❌ Missing BALLDONTLIE_API_KEY'); process.exit(1); }
console.log('API key found, length:', API_KEY.length);

const HEADERS = { 'Authorization': API_KEY };

async function get(url) {
  console.log('  GET', url);
  const res = await fetch(url, { headers: HEADERS });
  console.log('  Status:', res.status);
  if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
  return res.json();
}

async function fetchAll(baseUrl) {
  let all = [], cursor = null;
  while (true) {
    const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;
    const json = await get(url);
    all = all.concat(json.data || []);
    if (!json.meta?.next_cursor) break;
    cursor = json.meta.next_cursor;
  }
  return all;
}

async function main() {
  // 2025 = the 2025-26 NBA season
  console.log('Fetching season averages for 2025...');
  const avgs = await fetchAll('https://api.balldontlie.io/nba/v1/season_averages?seasons[]=2025&per_page=100');
  console.log(`Got ${avgs.length} averages`);
  const avgMap = {};
  avgs.forEach(a => avgMap[a.player_id] = a);

  console.log('Fetching active players...');
  const players = await fetchAll('https://api.balldontlie.io/nba/v1/players/active?per_page=100');
  console.log(`Got ${players.length} players`);

  const roster = {};
  for (const p of players) {
    const avg = avgMap[p.id];
    if (!avg || avg.games_played < 3) continue;
    const name = `${p.first_name} ${p.last_name}`;
    const team = p.team?.abbreviation || '';
    let mpg = 0;
    if (avg.min) {
      const parts = String(avg.min).split(':');
      mpg = parseFloat(parts[0]) + (parts[1] ? parseFloat(parts[1]) / 60 : 0);
    }
    roster[name] = {
      team, pos: p.position || '',
      ppg: +parseFloat(avg.pts||0).toFixed(1),
      rpg: +parseFloat(avg.reb||0).toFixed(1),
      apg: +parseFloat(avg.ast||0).toFixed(1),
      mpg: +parseFloat(mpg).toFixed(1),
      usg: 0, gp: avg.games_played || 0
    };
  }

  const count = Object.keys(roster).length;
  console.log(`Built ${count} players`);
  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done! roster.json updated with', count, 'players');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
