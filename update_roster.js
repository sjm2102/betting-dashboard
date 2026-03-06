// update_roster.js — scrapes nbastuffer.com for accurate per-game NBA stats
const fs = require('fs');

async function main() {
  console.log('Fetching stats from nbastuffer.com...');

  const res = await fetch('https://www.nbastuffer.com/2025-2026-nba-player-stats/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html',
      'Referer': 'https://www.nbastuffer.com/'
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  console.log(`Got ${html.length} chars of HTML`);

  // Extract table rows — find the stats table
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  if (!tableMatch) throw new Error('No table found in page');

  // Find the right table (the one with player stats)
  let statsTable = null;
  for (const t of tableMatch) {
    if (t.includes('PpG') || t.includes('MpG') || t.includes('USG')) {
      statsTable = t;
      break;
    }
  }
  if (!statsTable) throw new Error('Could not find stats table');
  console.log('Found stats table');

  // Parse header row to get column indices
  const headerMatch = statsTable.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const headers = [];
  if (headerMatch) {
    const ths = headerMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    ths.forEach(th => {
      headers.push(th.replace(/<[^>]+>/g, '').trim());
    });
  }
  console.log('Headers:', headers.join(', '));

  // Get column indices
  const idx = (name) => headers.findIndex(h => h === name);
  const iName  = idx('NAME');
  const iTeam  = idx('TEAM');
  const iPos   = idx('POS');
  const iGP    = idx('GP');
  const iMpG   = idx('MpG');
  const iPpG   = idx('PpG');
  const iRpG   = idx('RpG');
  const iApG   = idx('ApG');
  const iUSG   = idx('USG%');

  console.log(`Column indices — NAME:${iName} TEAM:${iTeam} POS:${iPos} GP:${iGP} MpG:${iMpG} PpG:${iPpG} RpG:${iRpG} ApG:${iApG} USG:${iUSG}`);

  // Parse tbody rows
  const tbodyMatch = statsTable.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) throw new Error('No tbody found');

  const rows = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  console.log(`Found ${rows.length} rows`);

  const roster = {};
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const vals = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
    if (vals.length < 10) continue;

    const name = vals[iName];
    const gp = parseInt(vals[iGP]) || 0;
    if (!name || gp < 3) continue;

    // Map team abbreviations to match what the app expects
    const teamRaw = (vals[iTeam] || '').trim();
    const TEAM_MAP = {
      'Atl':'ATL','Bos':'BOS','Bkn':'BKN','Cha':'CHA','Chi':'CHI',
      'Cle':'CLE','Dal':'DAL','Den':'DEN','Det':'DET','GS':'GS',
      'Hou':'HOU','Ind':'IND','LAC':'LAC','LAL':'LAL','Mem':'MEM',
      'Mia':'MIA','Mil':'MIL','Min':'MIN','NO':'NO','NY':'NY',
      'OKC':'OKC','Orl':'ORL','Phi':'PHI','Pho':'PHO','Por':'POR',
      'Sac':'SAC','SA':'SA','Tor':'TOR','Uta':'UTA','Was':'WAS'
    };
    const team = TEAM_MAP[teamRaw] || teamRaw.toUpperCase();

    roster[name] = {
      team,
      pos: vals[iPos] || '',
      ppg: +parseFloat(vals[iPpG] || 0).toFixed(1),
      rpg: +parseFloat(vals[iRpG] || 0).toFixed(1),
      apg: +parseFloat(vals[iApG] || 0).toFixed(1),
      mpg: +parseFloat(vals[iMpG] || 0).toFixed(1),
      usg: +parseFloat(vals[iUSG] || 0).toFixed(1),
      gp
    };
  }

  const count = Object.keys(roster).length;
  console.log(`\nBuilt ${count} players`);

  // Sanity check
  const sga = roster['Shai Gilgeous-Alexander'];
  if (sga) console.log('SGA:', JSON.stringify(sga));
  else console.warn('SGA not found — check name matching');

  const top3 = Object.entries(roster)
    .sort((a,b) => b[1].ppg - a[1].ppg)
    .slice(0,3);
  console.log('Top 3:', top3.map(([n,v]) => `${n}: ${v.ppg}ppg`).join(', '));

  if (count < 50) throw new Error(`Only ${count} players — aborting`);
  fs.writeFileSync('roster.json', JSON.stringify(roster, null, 2));
  console.log('✅ Done!', count, 'players written to roster.json');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
