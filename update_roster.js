// update_roster.js
// Uses NBA Stats API — completely free, no API key needed
const fs = require('fs');

const TEAM_MAP = {
  1610612737:"ATL",1610612738:"BOS",1610612751:"BKN",1610612766:"CHA",
  1610612741:"CHI",1610612739:"CLE",1610612742:"DAL",1610612743:"DEN",
  1610612765:"DET",1610612744:"GS",1610612745:"HOU",1610612754:"IND",
  1610612746:"LAC",1610612747:"LAL",1610612763:"MEM",1610612748:"MIA",
  1610612749:"MIL",1610612750:"MIN",1610612740:"NO",1610612752:"NY",
  1610612760:"OKC",1610612753:"ORL",1610612755:"PHI",1610612756:"PHO",
  1610612757:"POR",1610612758:"SAC",1610612759:"SA",1610612761:"TOR",
  1610612762:"UTA",1610612764:"WAS"
};

async function fetchNBAStats() {
  const url = 'https://stats.nba.com/stats/leaguedashplayerstats?' +
    'College=&Conference=&Country=&DateFrom=&DateTo=&Division=&' +
    'DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&ISTRound=&' +
    'LastNGames=0&LeagueID=00&Location=&MeasureType=Base&Month=0&' +
    'OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&' +
    'Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&' +
    'Season=2025-26&SeasonSegment=&SeasonType=Regular+Season&' +
    'ShotClockRange=&StarterBench=&TeamID=0&TwoWay=0&' +
    'VsConference=&VsDivision=&Weight=';

  console.log('Fetching NBA Stats...');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.nba.com/',
      'Origin': 'https://www.nba.com',
      'Accept': 'application/json',
      'x-nba-stats-origin': 'stats',
      'x-nba-stats-token': 'true'
    }
  });

  console.log('Status:', res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const data = await fetchNBAStats();
  const headers = data.resultSets[0].headers;
  const rows = data.resultSets[0].rowSet;

  const idx = (name) => headers.indexOf(name);
  const iName = idx('PLAYER_NAME');
  const iTeam = idx('TEAM_ABBREVIATION');
  const iPts  = idx('PTS');
  const iReb  = idx('REB');
  const iAst  = idx('AST');
  const iMin  = idx('MIN');
  const iGP   = idx('GP');

  console.log(`Got ${rows.length} players`);

  const roster = {};
  for (const row of rows) {
    if ((row[iGP] || 0) < 3) continue;
    const name = row[iName];
    roster[name] = {
      team: row[iTeam] || '',
      pos: '',
      ppg: +parseFloat(row[iPts]||0).toFixed(1),
      rpg: +parseFloat(row[iReb]||0).toFixed(1),
      apg: +parseFloat(row[iAst]||0).toFixed(1),
      mpg: +parseFloat(row[iMin]||0).toFixed(1),
      usg: 0,
      gp: row[iGP] || 0
    };
  }

  const count = Object.keys(roster).length;
  console.log(`Built ${count} players`);
  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done! roster.json updated with', count, 'players');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
