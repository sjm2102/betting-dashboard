// update_roster.js
// Fetches current NBA player stats from balldontlie.io
// Free API key required — sign up at balldontlie.io (takes 30 seconds)
// Add your key as a GitHub Secret named BALLDONTLIE_API_KEY

const fs = require('fs');

const API_KEY = process.env.BALLDONTLIE_API_KEY || '';

if (!API_KEY) {
  console.error('❌ Missing BALLDONTLIE_API_KEY environment variable.');
  console.error('Get a free key at https://balldontlie.io and add it as a GitHub Secret.');
  process.exit(1);
}

const HEADERS = { 'Authorization': API_KEY };

const TEAM_MAP = {
  1:"ATL",2:"BOS",3:"BKN",4:"CHA",5:"CHI",6:"CLE",7:"DAL",8:"DEN",
  9:"DET",10:"GS",11:"HOU",12:"IND",13:"LAC",14:"LAL",15:"MEM",
  16:"MIA",17:"MIL",18:"MIN",19:"NO",20:"NY",21:"OKC",22:"ORL",
  23:"PHI",24:"PHO",25:"POR",26:"SAC",27:"SA",28:"TOR",29:"UTA",30:"WAS"
};

async function fetchAll(url) {
  let results = [];
  let cursor = 0;
  let hasMore = true;
  while (hasMore) {
    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${sep}per_page=100&cursor=${cursor}`;
    console.log(`  Fetching: ${fullUrl}`);
    const res = await fetch(fullUrl, { headers: HEADERS });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    results = results.concat(json.data || []);
    if (json.meta?.next_cursor) {
      cursor = json.meta.next_cursor;
    } else {
      hasMore = false;
    }
  }
  return results;
}

async function main() {
  console.log('Fetching NBA season averages from balldontlie.io...');
  const seasonAvgs = await fetchAll('https://api.balldontlie.io/v1/season_averages?season=2024');
  console.log(`Got ${seasonAvgs.length} player averages.`);

  const avgMap = {};
  for (const avg of seasonAvgs) avgMap[avg.player_id] = avg;

  console.log('Fetching player details...');
  const players = await fetchAll('https://api.balldontlie.io/v1/players');
  console.log(`Got ${players.length} players.`);

  const roster = {};
  for (const player of players) {
    const avg = avgMap[player.id];
    if (!avg || !avg.games_played || avg.games_played < 3) continue;
    const fullName = `${player.first_name} ${player.last_name}`;
    const team = player.team?.abbreviation || TEAM_MAP[player.team?.id] || '';
    let mpg = 0;
    if (avg.min) {
      const parts = String(avg.min).split(':');
      mpg = parseFloat(parts[0]) + (parts[1] ? parseFloat(parts[1]) / 60 : 0);
    }
    roster[fullName] = {
      team,
      pos: player.position || '',
      ppg: parseFloat((avg.pts || 0).toFixed(1)),
      rpg: parseFloat((avg.reb || 0).toFixed(1)),
      apg: parseFloat((avg.ast || 0).toFixed(1)),
      mpg: parseFloat(mpg.toFixed(1)),
      usg: 0,
      gp: avg.games_played || 0
    };
  }

  const count = Object.keys(roster).length;
  console.log(`Built roster with ${count} players.`);
  if (count < 50) throw new Error(`Too few players (${count}) — aborting to preserve existing roster.json`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log(`✅ roster.json written with ${count} players.`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
