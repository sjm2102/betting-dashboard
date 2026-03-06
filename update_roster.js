// update_roster.js
const fs = require('fs');

const API_KEY = process.env.BALLDONTLIE_API_KEY || '';
if (!API_KEY) { console.error('❌ Missing BALLDONTLIE_API_KEY'); process.exit(1); }

console.log('API key found, length:', API_KEY.length);

const HEADERS = { 'Authorization': API_KEY };
const BASE = 'https://api.balldontlie.io/nba/v1'; // ← correct NBA base URL

async function fetchAll(url) {
  let all = [], cursor = null;
  while (true) {
    const fullUrl = cursor ? `${url}&cursor=${cursor}` : url;
    console.log('  GET', fullUrl);
    const res = await fetch(fullUrl, { headers: HEADERS });
    console.log('  Status:', res.status);
    if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
    const json = await res.json();
    all = all.concat(json.data || []);
    if (!json.meta?.next_cursor) break;
    cursor = json.meta.next_cursor;
  }
  return all;
}

async function main() {
  console.log('Fetching season averages...');
  const avgs = await fetchAll(`${BASE}/season_averages?season=2024&per_page=100`);
  console.log(`Got ${avgs.length} averages`);

  const avgMap = {};
  avgs.forEach(a => avgMap[a.player_id] = a);

  console.log('Fetching players...');
  const players = await fetchAll(`${BASE}/players?per_page=100`);
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
