// update_roster.js
// Fetches current NBA player stats from balldontlie.io (free, no key needed)
// and writes roster.json in the format the app expects.
// Run via GitHub Actions on a daily schedule.

const fs = require('fs');

const TEAM_MAP = {
  1:"ATL",2:"BOS",3:"BKN",4:"CHA",5:"CHI",6:"CLE",7:"DAL",8:"DEN",
  9:"DET",10:"GS",11:"HOU",12:"IND",13:"LAC",14:"LAL",15:"MEM",
  16:"MIA",17:"MIL",18:"MIN",19:"NO",20:"NY",21:"OKC",22:"ORL",
  23:"PHI",24:"PHO",25:"POR",26:"SAC",27:"SA",28:"TOR",29:"UTA",30:"WAS"
};

const POS_MAP = {
  "G":"PG","F":"SF","C":"C","G-F":"SG","F-G":"SG","F-C":"PF","C-F":"PF"
};

async function fetchAll(url) {
  let results = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}per_page=100&cursor=${cursor}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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
  console.log('Fetching NBA season averages...');

  // Get current season averages — balldontlie uses current season by default
  const seasonAvgs = await fetchAll('https://api.balldontlie.io/v1/season_averages?season=2024');

  // Get player details for names and positions
  console.log(`Got ${seasonAvgs.length} player averages. Fetching player details...`);

  // Build a map of player_id -> avg
  const avgMap = {};
  for (const avg of seasonAvgs) {
    avgMap[avg.player_id] = avg;
  }

  // Fetch all active players
  const players = await fetchAll('https://api.balldontlie.io/v1/players?per_page=100');
  console.log(`Got ${players.length} players.`);

  const roster = {};

  for (const player of players) {
    const avg = avgMap[player.id];
    if (!avg) continue; // skip players with no stats this season

    const fullName = `${player.first_name} ${player.last_name}`;
    const teamId = player.team?.id;
    const team = TEAM_MAP[teamId] || player.team?.abbreviation || '';
    const pos = POS_MAP[player.position] || player.position || '';

    roster[fullName] = {
      team,
      pos,
      ppg: parseFloat((avg.pts || 0).toFixed(1)),
      rpg: parseFloat((avg.reb || 0).toFixed(1)),
      apg: parseFloat((avg.ast || 0).toFixed(1)),
      mpg: parseFloat((avg.min ? parseFloat(avg.min) : 0).toFixed(1)),
      usg: 0, // balldontlie free tier doesn't include USG%
      gp: avg.games_played || 0
    };
  }

  const count = Object.keys(roster).length;
  console.log(`Built roster with ${count} players.`);

  if (count < 100) {
    throw new Error(`Too few players (${count}) — API may be rate limited. Aborting to preserve existing roster.json`);
  }

  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log(`✅ roster.json written with ${count} players.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
