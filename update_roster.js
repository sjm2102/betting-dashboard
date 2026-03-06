// update_roster.js
const fs = require('fs');

const API_KEY = process.env.BALLDONTLIE_API_KEY || '';

if (!API_KEY) {
  console.error('❌ Missing BALLDONTLIE_API_KEY');
  process.exit(1);
}

console.log('API key found, length:', API_KEY.length);

// balldontlie v1 requires Authorization header WITHOUT "Bearer" prefix
const HEADERS = {
  'Authorization': API_KEY,
  'Content-Type': 'application/json'
};

const TEAM_ABR = {
  1:"ATL",2:"BOS",3:"BKN",4:"CHA",5:"CHI",6:"CLE",7:"DAL",8:"DEN",
  9:"DET",10:"GS",11:"HOU",12:"IND",13:"LAC",14:"LAL",15:"MEM",
  16:"MIA",17:"MIL",18:"MIN",19:"NO",20:"NY",21:"OKC",22:"ORL",
  23:"PHI",24:"PHO",25:"POR",26:"SAC",27:"SA",28:"TOR",29:"UTA",30:"WAS"
};

async function fetchPage(url) {
  console.log('  GET', url);
  const res = await fetch(url, { headers: HEADERS });
  console.log('  Status:', res.status);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

async function fetchAll(baseUrl) {
  let all = [], cursor = null;
  while (true) {
    const url = cursor ? `${baseUrl}&cursor=${cursor}` : baseUrl;
    const json = await fetchPage(url);
    all = all.concat(json.data || []);
    if (!json.meta?.next_cursor) break;
    cursor = json.meta.next_cursor;
  }
  return all;
}

async function main() {
  console.log('Fetching season averages...');
  const avgs = await fetchAll('https://api.balldontlie.io/v1/season_averages?season=2024&per_page=100');
  console.log(`Got ${avgs.length} averages`);

  const avgMap = {};
  avgs.forEach(a => avgMap[a.player_id] = a);

  console.log('Fetching players...');
  const players = await fetchAll('https://api.balldontlie.io/v1/players?per_page=100');
  console.log(`Got ${players.length} players`);

  const roster = {};
  for (const p of players) {
    const avg = avgMap[p.id];
    if (!avg || avg.games_played < 3) continue;
    const name = `${p.first_name} ${p.last_name}`;
    const team = p.team?.abbreviation || TEAM_ABR[p.team?.id] || '';
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
  console.log('✅ Done!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
