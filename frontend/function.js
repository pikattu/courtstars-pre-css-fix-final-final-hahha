"use strict";
/* ═══════════════════════════════════════════════════════════════
   COURTSTARS v3.0 — function.js
   Architecture: Module-style IIFE with shared state
   Data flow: PHP API → JS store → Render → DOM
═══════════════════════════════════════════════════════════════ */

/* ── API CONFIG ─────────────────────────────────────────────── */
const API = {
  players:      '/courtstars/api/get_players.php',
  teams:        '/courtstars/api/get_teams.php',
  leaderboards: '/courtstars/api/get_leaderboards.php',
  charts:       '/courtstars/api/get_charts.php',
  ticker:       '/courtstars/api/get_ticker.php',
  summary:      '/courtstars/api/get_summary.php',
  history:      '/courtstars/api/get_history.php',
  news:         '/courtstars/api/get_news.php',
  sync:         '/courtstars/api/sync_stats.php',
};

/* ══════════════════════════════════════════════════════════════
   🏀 SPOTLIGHT CUSTOM IMAGES
   Map a player's full name (must match your DB exactly) to a
   local image path or any URL. The spotlight background on the
   left panel will use this image when that player's card is hovered.

   How to add:
     'First Last': 'imgs/your-photo.jpg',

   Leave a player out to fall back to their avatar from the DB.
   Keys are case-sensitive and must match the player name exactly.
══════════════════════════════════════════════════════════════ */
const SPOTLIGHT_IMAGES = {
  // Example entries — replace with your own:
  'Luke Kennard':   'imgs/luke.jpeg',
  'Dante Exum':  'imgs/dante.avif',
  'Kyrie Irving':   'imgs/kyrie.jpg',
};

/* ── GLOBAL STATE ───────────────────────────────────────────── */
let players        = [];
let teams          = [];
let leaderboards   = {};
let summaryStats   = {};
let scoringData    = [];
let threePtData    = [];
let historyEvents  = [];
let tickerGames    = [];
let newsArticles   = [];

// UI state
let viewMode         = 'table';
let activePos        = 'ALL';
let activeConf       = 'ALL';
let activeLbCategory = 'points';
let showFavoritesOnly = false;
let currentPage      = 1;
const PAGE_SIZE      = 15;

// Schedule bar
let scheduleIndex = 0;

// Modals
let currentPlayerModal = null;
let currentTeamModal   = null;

// Favorites & Compare
let favorites  = new Set(JSON.parse(localStorage.getItem('cs_favorites') || '[]'));
let compareSet = new Set();

// OTD
let otdIndex = 0;

// Carousel
let carouselCurrent = 0;

/* ── TEAM META ──────────────────────────────────────────────── */
const TEAM_META = {
  "Atlanta Hawks":          { bg:"e03a3e", abbrev:"atl",  espn:"atl"  },
  "Boston Celtics":         { bg:"007a33", abbrev:"bos",  espn:"bos"  },
  "Brooklyn Nets":          { bg:"000000", abbrev:"bkn",  espn:"bkn"  },
  "Charlotte Hornets":      { bg:"1d1160", abbrev:"cha",  espn:"cha"  },
  "Chicago Bulls":          { bg:"ce1141", abbrev:"chi",  espn:"chi"  },
  "Cleveland Cavaliers":    { bg:"860038", abbrev:"cle",  espn:"cle"  },
  "Dallas Mavericks":       { bg:"00538c", abbrev:"dal",  espn:"dal"  },
  "Denver Nuggets":         { bg:"0e2240", abbrev:"den",  espn:"den"  },
  "Detroit Pistons":        { bg:"c8102e", abbrev:"det",  espn:"det"  },
  "Golden State Warriors":  { bg:"1d428a", abbrev:"gsw",  espn:"gs"   },  // ESPN uses "gs"
  "Houston Rockets":        { bg:"ce1141", abbrev:"hou",  espn:"hou"  },
  "Indiana Pacers":         { bg:"002d62", abbrev:"ind",  espn:"ind"  },
  "Los Angeles Clippers":   { bg:"c8102e", abbrev:"lac",  espn:"lac"  },
  "Los Angeles Lakers":     { bg:"552583", abbrev:"lal",  espn:"lal"  },
  "Memphis Grizzlies":      { bg:"5d76a9", abbrev:"mem",  espn:"mem"  },
  "Miami Heat":             { bg:"98002e", abbrev:"mia",  espn:"mia"  },
  "Milwaukee Bucks":        { bg:"00471b", abbrev:"mil",  espn:"mil"  },
  "Minnesota Timberwolves": { bg:"0c2340", abbrev:"min",  espn:"min"  },
  "New Orleans Pelicans":   { bg:"0c2340", abbrev:"nop",  espn:"no"   },  // ESPN uses "no"
  "New York Knicks":        { bg:"006bb6", abbrev:"nyk",  espn:"nyk"  },
  "Oklahoma City Thunder":  { bg:"007ac1", abbrev:"okc",  espn:"okc"  },
  "Orlando Magic":          { bg:"0077c0", abbrev:"orl",  espn:"orl"  },
  "Philadelphia 76ers":     { bg:"006bb6", abbrev:"phi",  espn:"phi"  },
  "Phoenix Suns":           { bg:"1d1160", abbrev:"phx",  espn:"phx"  },
  "Portland Trail Blazers": { bg:"e03a3e", abbrev:"por",  espn:"por"  },
  "Sacramento Kings":       { bg:"5a2d81", abbrev:"sac",  espn:"sac"  },
  "San Antonio Spurs":      { bg:"b0b7bc", abbrev:"sas",  espn:"sa"   },  // ESPN uses "sa"
  "Toronto Raptors":        { bg:"ce1141", abbrev:"tor",  espn:"tor"  },
  "Utah Jazz":              { bg:"002b5c", abbrev:"uta",  espn:"utah" },  // ESPN uses "utah"
  "Washington Wizards":     { bg:"002b5c", abbrev:"wsh",  espn:"wsh"  },
  default:                  { bg:"F05A1A", abbrev:"nba",  espn:"nba"  },
};

function getTeamMeta(name) { return TEAM_META[name] || TEAM_META.default; }

// Build ESPN CDN logo URL with primary + fallback abbreviations
function buildLogoUrl(abbrev, teamName) {
  const meta    = getTeamMeta(teamName);
  const espnAbb = meta.espn || meta.abbrev;
  // Try ESPN CDN first, then NBA CDN as fallback (handled via onerror in DOM)
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnAbb}.png`;
}

/* ── DATA FETCHING ──────────────────────────────────────────── */
async function apiFetch(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSummary() {
  try {
    const r = await apiFetch(API.summary);
    if (r.success) { summaryStats = r.data; renderSummaryStrip(); }
  } catch(e) { console.warn('Summary:', e); }
}

async function loadPlayers() {
  try {
    const r = await apiFetch(API.players);
    if (!r.success) throw new Error(r.error);
    players = r.data.map(mapPlayer);
    renderSpotlight();
    renderPlayers();
    populateTeamFilter();
    setTimeout(refreshRevealAnimations, 100);
    populateHeatmapSelect();
    updateFavBadge();
    renderHeroSpotlight();
  } catch(e) {
    console.error('Players:', e);
    const count = document.getElementById('playerCount');
    const container = document.getElementById('playersContainer');
    if (count) count.textContent = 'Players unavailable';
    if (container) container.innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center">Could not load players from the database.</p>';
    showToast('Could not load players from database', 'error');
  }
}

async function loadTeams() {
  try {
    const r = await apiFetch(API.teams);
    if (!r.success) throw new Error(r.error);
    teams = r.data.map(mapTeam);
    renderTeams();
    setTimeout(refreshRevealAnimations, 100);
  } catch(e) {
    console.error('Teams:', e);
    document.getElementById('teamsGrid').innerHTML = '<p style="color:var(--muted);padding:20px">No team data found.</p>';
  }
}

async function loadLeaderboards() {
  const categories = ['points','rebounds','assists','steals','blocks'];
  for (const cat of categories) {
    try {
      const r = await apiFetch(`${API.leaderboards}?category=${cat}&limit=10`);
      if (r.success) {
        leaderboards[cat] = r.data.map(row => ({
          rank:      Number(row.rank),
          name:      row.player_name,
          val:       Number(row.stat_value).toFixed(1),
          teamAbbr:  row.team_abbr || 'NBA',
          teamColor: row.team_color ? '#' + row.team_color.replace('#','') : '#B8962E',
          avatarUrl: row.avatar_url || null,
          playerId:  row.id,
        }));
      }
    } catch(e) { console.warn(`LB ${cat}:`, e); }
  }
  renderLeaderboard();
  renderSpotlight();
  renderHeroSpotlight();
  setTimeout(refreshRevealAnimations, 100);
}

async function loadCharts() {
  try {
    const r = await apiFetch(API.charts);
    if (r.success) {
      scoringData = r.data.scoring_leaders    || [];
      threePtData = r.data.three_point_leaders || [];
      // Advanced stats (available after nba_api sync)
      window.perData      = r.data.per_leaders        || [];
      window.tsData       = r.data.ts_pct_leaders     || [];
      window.usageData    = r.data.usage_leaders      || [];
      window.netRtgData   = r.data.net_rating_leaders || [];
      renderScoringChart();
      renderThreePtChart();
      renderStatCards();
    }
  } catch(e) { console.warn('Charts:', e); }
}

async function loadHistory() {
  try {
    const r = await apiFetch(API.history);
    if (r.success && r.data.length > 0) {
      historyEvents = r.data;
      renderTimeline();
      setTimeout(refreshRevealAnimations, 100);
      document.getElementById('historyFallback').style.display = 'none';
    } else {
      renderHistoryFallback();
    }
  } catch(e) { renderHistoryFallback(); }
}

async function loadTicker() {
  const track = document.getElementById('tickerTrack');
  try {
    // Fetch news from ESPN for the ticker
    const newsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=10');
    const newsJson = await newsRes.json();
    const articles = newsJson.articles || [];

    const items = [];

    // Add scoring leader from local API if available
    try {
      const r = await apiFetch(API.ticker);
      if (r.success && r.data.scoring_leader) {
        const leader = r.data.scoring_leader;
        items.push(`<span class="bt-item"><strong>🏅 ${leader.player_name}</strong> leads scoring — ${Number(leader.points_per_game).toFixed(1)} PPG <span style="color:var(--muted)">${leader.team_abbr || ''}</span></span>`);
        tickerGames = r.data.games || [];
        renderCountdown(tickerGames);
      }
    } catch(e) { /* no local data */ }

    // Add ESPN news headlines as summaries
    articles.forEach(art => {
      const headline = art.headline || 'NBA Update';
      const desc = art.description ? ' — ' + art.description.substring(0, 80) + (art.description.length > 80 ? '…' : '') : '';
      items.push(`<span class="bt-item">📰 <strong>${headline}</strong>${desc}</span>`);
    });

    if (!items.length) items.push('<span class="bt-item">NBA news loading…</span>');

    const sep = '<span class="bt-sep">|</span>';
    const html = items.join(sep);
    track.innerHTML = html + sep + html;

  } catch(e) {
    track.innerHTML = '<span class="bt-item">Live news unavailable.</span>';
  }

  // Load schedule bar from ESPN separately
  loadScheduleBar();
}

/* ── NEWS LOADING ────────────────────────────────────────────── */
async function loadNews() {
  try {
    const r = await apiFetch(`${API.news}?limit=8`);
    if (r.success && r.data.length > 0) {
      newsArticles = r.data;
      renderNews();
      setTimeout(refreshRevealAnimations, 100);
    }
  } catch(e) {
    // API unavailable — fallback already rendered by init
    console.warn('News API:', e);
  }
}

/* ── DATA MAPPERS ────────────────────────────────────────────── */
function mapPlayer(p) {
  const name = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
  const team = p.team_name || 'Free Agent';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const teamColorRaw = p.team_color || '';
  const teamColor = teamColorRaw.startsWith('#') ? teamColorRaw : (teamColorRaw ? '#' + teamColorRaw : '#B8962E');

  return {
    id:          Number(p.id),
    name, initials, team,
    teamAbbr:    p.team_abbr || '—',
    teamColor,
    teamId:      p.team_id ? Number(p.team_id) : null,
    teamLogo:    p.team_logo_url || null,
    image:       p.photo_url || p.avatar_url || null,
    position:    normalizePosition(p.position),
    jersey:      p.jersey_number || '—',
    height:      p.height_display || (p.height_inches ? formatHeight(p.height_inches) : '—'),
    weight:      p.weight_lbs ? `${p.weight_lbs} lbs` : '—',
    country:     p.country || '—',
    gamesPlayed: Number(p.games_played || 0),
    minutes:     Number(p.minutes_per_game || 0),
    ppg:         Number(p.points_per_game   || 0),
    rpg:         Number(p.rebounds_per_game || 0),
    apg:         Number(p.assists_per_game  || 0),
    spg:         Number(p.steals_per_game   || 0),
    bpg:         Number(p.blocks_per_game   || 0),
    fgp:         p.field_goal_pct  ? (Number(p.field_goal_pct)  * 100).toFixed(1) : '—',
    tpp:         p.three_pt_pct    ? (Number(p.three_pt_pct)    * 100).toFixed(1) : '—',
    ftp:         p.free_throw_pct  ? (Number(p.free_throw_pct)  * 100).toFixed(1) : '—',
    tov:         Number(p.turnovers_per_game || 0),
    oreb:        Number(p.offensive_rebounds || 0),
    dreb:        Number(p.defensive_rebounds || 0),
    gamesStarted: Number(p.games_started || 0),
    // Advanced stats from nba_api
    per:         p.player_efficiency_rating ? Number(p.player_efficiency_rating) : null,
    tsPct:       p.true_shooting_pct ? (Number(p.true_shooting_pct) * 100).toFixed(1) : null,
    astPct:      p.assist_pct ? (Number(p.assist_pct) * 100).toFixed(1) : null,
    usgPct:      p.usage_rate ? (Number(p.usage_rate) * 100).toFixed(1) : null,
    ortg:        p.offensive_rating ? Number(p.offensive_rating).toFixed(1) : null,
    drtg:        p.defensive_rating ? Number(p.defensive_rating).toFixed(1) : null,
    netRtg:      p.net_rating ? Number(p.net_rating).toFixed(1) : null,
    statsUpdated:p.stats_updated_at || null,
    badges:      Array.isArray(p.badges) ? p.badges : [],
    strengths:   p.strengths || { scoring:50, defense:50, playmaking:50, athleticism:50, shooting:50, rebounding:50 },
    recentGames: p.recent_games || [],
  };
}

function mapTeam(t) {
  const meta    = getTeamMeta(t.full_name);
  const abbrev  = t.abbreviation || meta.abbrev;
  const logoUrl = t.logo_url || buildLogoUrl(abbrev, t.full_name);
  return {
    id:           Number(t.id),
    name:         t.full_name,
    shortName:    t.short_name || t.full_name,
    abbrev,
    conference:   t.conference === 'East' ? 'Eastern' : (t.conference === 'West' ? 'Western' : t.conference || ''),
    division:     t.division || '',
    arena:        t.arena || 'TBD',
    primaryColor: t.primary_color || `#${meta.bg}`,
    secondaryColor: t.secondary_color || '#D4A847',
    logoUrl,
    championships: Number(t.championships || 0),
    founded:      t.founded_year || '',
    rosterCount:  Number(t.roster_count || 0),
    legends:      t.legends || '',
    rivals:       t.rivals || '',
    history:      t.history || '',
  };
}

function normalizePosition(pos) {
  const p = String(pos || '').toUpperCase();
  if (['PG','SG','SF','PF','C'].includes(p)) return p;
  if (p.includes('G')) return 'SG';
  if (p.includes('F')) return 'SF';
  if (p.includes('C')) return 'C';
  return 'PG';
}
function formatHeight(inches) { return `${Math.floor(inches/12)}'${inches%12}"`; }
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

/* ── RENDER: SUMMARY STRIP ──────────────────────────────────── */
function renderSummaryStrip() {
  animCounter('sum-players',       summaryStats.players       || 0);
  animCounter('sum-teams',         summaryStats.teams         || 0);
  animCounter('sum-seasons',       summaryStats.seasons       || 0);
  animCounter('sum-championships', summaryStats.championships || 0);
}

function animCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = target / 60;
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = Math.round(cur);
    if (cur >= target) clearInterval(t);
  }, 16);
}

/* ── RENDER: SCHEDULE BAR (ESPN Scoreboard) ──────────────────── */
async function loadScheduleBar() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const json = await res.json();
    const events = json.events || [];

    if (!events.length) {
      renderScheduleBar([]);
      return;
    }

    const games = events.map(ev => {
      const comp = ev.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      const status = comp.status?.type?.name || 'STATUS_SCHEDULED';
      const detail = comp.status?.type?.shortDetail || '';
      const isLive = status === 'STATUS_IN_PROGRESS';
      const isDone = status === 'STATUS_FINAL';

      // Parse date
      const d = new Date(ev.date);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      return {
        away_team:  away?.team?.abbreviation || '???',
        home_team:  home?.team?.abbreviation || '???',
        away_score: isDone || isLive ? (away?.score ?? '—') : null,
        home_score: isDone || isLive ? (home?.score ?? '—') : null,
        status:     isDone ? 'FINAL' : (isLive ? 'LIVE' : timeStr),
        date:       dateStr,
        isLive,
        isDone,
        detail,
      };
    });

    renderScheduleBar(games);
  } catch(e) {
    console.warn('ESPN scoreboard:', e);
    renderScheduleBar([]);
  }
}

function renderScheduleBar(games) {
  const bar = document.getElementById('scheduleBar');
  if (!bar) return;

  if (!games || !games.length) {
    bar.innerHTML = `
      <button class="sb-arrow" onclick="scheduleBarPrev()" aria-label="Previous">&#8249;</button>
      <div class="sb-games" id="sbGames">
        <div class="sb-game"><div class="sb-game-matchup"><span class="sb-status">No schedule data</span></div></div>
      </div>
      <button class="sb-arrow" onclick="scheduleBarNext()" aria-label="Next">&#8250;</button>`;
    return;
  }

  const htmlGames = games.map(g => {
    const scoreHtml = (g.isDone || g.isLive)
      ? `<span class="sb-score">${g.away_score} – ${g.home_score}</span>`
      : `<span class="sb-score muted">vs</span>`;

    const statusLabel = g.isLive
      ? `<span class="sb-live-badge">🔴 LIVE${g.detail ? ' · '+g.detail : ''}</span>`
      : `<span class="sb-status">${g.isDone ? 'FINAL' : g.status}</span>`;

    return `
      <div class="sb-game ${g.isLive ? 'live' : ''}">
        <div class="sb-game-matchup">
          <span class="sb-team">${g.away_team}</span>
          ${scoreHtml}
          <span class="sb-team">${g.home_team}</span>
          ${statusLabel}
        </div>
        <div class="sb-game-date">${g.date}</div>
      </div>`;
  }).join('');

  bar.innerHTML = `
    <button class="sb-arrow" onclick="scheduleBarPrev()" aria-label="Previous">&#8249;</button>
    <div class="sb-games" id="sbGames">${htmlGames}</div>
    <button class="sb-arrow" onclick="scheduleBarNext()" aria-label="Next">&#8250;</button>`;

  scheduleIndex = 0;
  updateScheduleScroll();
}

function scheduleBarPrev() {
  if (scheduleIndex > 0) { scheduleIndex--; updateScheduleScroll(); }
}
function scheduleBarNext() {
  const cards = document.querySelectorAll('.sb-game');
  if (scheduleIndex < cards.length - 1) { scheduleIndex++; updateScheduleScroll(); }
}
function updateScheduleScroll() {
  const container = document.getElementById('sbGames');
  if (!container) return;
  const card = container.querySelector('.sb-game');
  if (!card) return;
  const w = card.offsetWidth + 16; // width + gap
  container.scrollTo({ left: scheduleIndex * w, behavior: 'smooth' });
}

/* ── RENDER: HERO SPOTLIGHT ─────────────────────────────────── */
function renderHeroSpotlight() {
  const top = getSpotlightFeaturedPlayers()[0] || players.filter(p => p.ppg > 0).sort((a,b) => b.ppg - a.ppg)[0];
  if (!top) return;

  const avatarEl = document.getElementById('hscAvatar');
  if (top.image) {
    avatarEl.innerHTML = `<img src="${top.image}" alt="${top.name}"
      onerror="this.parentNode.textContent='${top.initials}'"
      style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else { avatarEl.textContent = top.initials; }
  avatarEl.style.background = `${top.teamColor}22`;
  avatarEl.style.color = top.teamColor;

  document.getElementById('hscName').textContent = top.name;
  document.getElementById('hscTeam').textContent = `${top.teamAbbr} · ${top.team}`;
  document.getElementById('hscStats').innerHTML = `
    <div class="hsc-stat"><div class="hsc-stat-val">${top.ppg.toFixed(1)}</div><div class="hsc-stat-lbl">PPG</div></div>
    <div class="hsc-stat"><div class="hsc-stat-val">${top.rpg.toFixed(1)}</div><div class="hsc-stat-lbl">RPG</div></div>
    <div class="hsc-stat"><div class="hsc-stat-val">${top.apg.toFixed(1)}</div><div class="hsc-stat-lbl">APG</div></div>
  `;

  document.getElementById('heroSpotlight').style.cursor = 'pointer';
  document.getElementById('heroSpotlight').onclick = () => openPlayerModal(top.id);
}
const cards = document.querySelectorAll('.spotlight-card');
const bgImages = document.querySelectorAll('#spotlightBgImage img');

cards.forEach((card, index) => {
  card.addEventListener('mouseenter', () => {
    bgImages.forEach(img => img.classList.remove('active'));
    bgImages[index].classList.add('active');
  });
});
/* ── RENDER: COUNTDOWN ──────────────────────────────────────── */
function renderCountdown(games) {
  const upcoming = games.find(g => g.status === 'Scheduled');
  if (!upcoming) {
    document.getElementById('hcdMatchup').innerHTML = `<span class="hcd-team">Season</span><span class="hcd-vs">in</span><span class="hcd-team">Progress</span>`;
    return;
  }

  document.getElementById('hcdMatchup').innerHTML = `
    <span class="hcd-team">${upcoming.away_team}</span>
    <span class="hcd-vs">@</span>
    <span class="hcd-team">${upcoming.home_team}</span>`;

  const target = new Date(upcoming.game_date).getTime();
  function tick() {
    const diff = Math.max(0, target - Date.now());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('hcdH').textContent = String(h).padStart(2,'0');
    document.getElementById('hcdM').textContent = String(m).padStart(2,'0');
    document.getElementById('hcdS').textContent = String(s).padStart(2,'0');
    if (diff > 0) setTimeout(tick, 1000);
  }
  tick();
}

/* ── RENDER: NEWS SECTION ───────────────────────────────────── */
const NBA_NEWS_FALLBACK = [
  {
    title: "Stephen Curry Drops 45 in Warriors Win Over the Pelicans",
    desc: "Curry shot 9-for-16 from three-point range as Golden State improves to second in the West.",
    source: "ESPN", date: "Today", category: "Game Recap",
    image: "https://picsum.photos/seed/curry-warriors/800/450",
    content: "In a dominant performance at Chase Center, Stephen Curry reminded the league why he remains the most dangerous shooter of all time, dropping 45 points on 55% shooting."
  },
  {
    title: "LeBron James on the Verge of Breaking Another Scoring Record",
    desc: "The King needs just 83 more points to surpass yet another all-time benchmark.",
    source: "NBA.com", date: "Yesterday", category: "Records",
    image: "https://picsum.photos/seed/lebron-record/800/450",
    content: "At 40 years old, LeBron James continues to defy the laws of basketball physics, averaging 22.1 points per game this season on 53% shooting."
  },
  {
    title: "Victor Wembanyama Putting Up Numbers Nobody Has Seen Since Olajuwon",
    desc: "The French phenom is drawing comparisons to the greatest big men in NBA history.",
    source: "The Athletic", date: "2 days ago", category: "Analysis",
    image: "https://picsum.photos/seed/wemby-spurs/800/450",
    content: "Victor Wembanyama's combination of shot-blocking, three-point shooting, and floor-spacing at 7'4\" is genuinely unprecedented in NBA history."
  },
  {
    title: "Trade Deadline Heats Up: Three-Team Blockbuster in the Works",
    desc: "Multiple sources confirm discussions involving a star guard, a veteran big, and two picks.",
    source: "ESPN", date: "3 days ago", category: "Trades",
    image: "https://picsum.photos/seed/nba-trade-deadline/800/450",
    content: "League sources indicate at least three teams are in advanced discussions about a blockbuster deal that would reshape the Western Conference before the February deadline."
  },
  {
    title: "Nikola Jokić is Having the Greatest Statistical Season in NBA History",
    desc: "The three-time MVP's efficiency metrics have never been seen at any size in 75 years.",
    source: "The Ringer", date: "4 days ago", category: "Analysis",
    image: "https://picsum.photos/seed/jokic-nuggets/800/450",
    content: "Nikola Jokić's Player Efficiency Rating of 34.2 is the highest ever recorded. His True Shooting of 68.3% leads all qualified players by a wide margin."
  },
  {
    title: "NBA All-Star Weekend: Everything You Need to Know",
    desc: "From the Slam Dunk Contest to the Three-Point Shootout, full preview of this year's festivities.",
    source: "Bleacher Report", date: "5 days ago", category: "Events",
    image: "https://picsum.photos/seed/nba-allstar-weekend/800/450",
    content: "All-Star Weekend returns to Indianapolis for the first time in over a decade, loaded with marquee events including a new tournament-format All-Star Game."
  },
];

function renderNews() {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;

  // Use live data if available, otherwise fallback
  const items = (newsArticles && newsArticles.length > 0) ? newsArticles : NBA_NEWS_FALLBACK;

  grid.innerHTML = items.slice(0, 7).map((n, i) => {
    const imgHtml = n.image
      ? `<img src="${n.image}" alt="${n.title}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
            loading="lazy" />
         <div class="news-img-placeholder" style="display:none">🏀</div>`
      : `<div class="news-img-placeholder">🏀</div>`;

    return `
      <div class="news-card ${i === 0 ? 'featured' : ''}" onclick="openNewsModal(${i})">
        <div class="news-img-wrap">
          ${imgHtml}
          <div class="news-source-badge">${n.source}</div>
        </div>
        <div class="news-content">
          <div class="news-meta">
            <span>${n.category}</span>
            <span class="news-dot"></span>
            <span>${n.date}</span>
          </div>
          <div class="news-title">${n.title}</div>
          ${i === 0 ? `<div class="news-desc">${n.desc}</div>` : ''}
          <div class="news-read-more">Read more →</div>
        </div>
      </div>`;
  }).join('');
}

function openNewsModal(idx) {
  const items = (newsArticles && newsArticles.length > 0) ? newsArticles : NBA_NEWS_FALLBACK;
  const n = items[idx];
  if (!n) return;

  const imgHtml = n.image
    ? `<div style="width:100%;height:240px;overflow:hidden;border-radius:var(--radius-lg);margin-bottom:24px;background:var(--bg3)">
         <img src="${n.image}" alt="${n.title}"
              onerror="this.parentNode.innerHTML='<div style=\'font-size:60px;text-align:center;padding:60px 0\'>🏀</div>'"
              style="width:100%;height:100%;object-fit:cover;display:block" />
       </div>`
    : `<div style="font-size:80px;text-align:center;padding:40px 0;background:var(--bg3);border-radius:var(--radius-lg);margin-bottom:24px">🏀</div>`;

  document.getElementById('newsModalBody').innerHTML = `
    ${imgHtml}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--gold)">${n.category}</span>
      <span style="font-size:11px;color:var(--muted2)">·</span>
      <span style="font-size:11px;color:var(--muted)">${n.source}</span>
      <span style="font-size:11px;color:var(--muted2)">·</span>
      <span style="font-size:11px;color:var(--muted)">${n.date}</span>
    </div>
    <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:var(--white);line-height:1.25;margin-bottom:16px">${n.title}</h2>
    <p style="font-size:15px;color:var(--text);line-height:1.75">${n.content || n.desc}</p>
    ${n.url && n.url !== '#' ? `<a href="${n.url}" target="_blank" rel="noopener" style="display:inline-block;margin-top:20px;padding:10px 20px;background:var(--gold);color:#fff;border-radius:var(--radius);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;text-decoration:none">Read Full Article →</a>` : ''}
  `;
  document.getElementById('newsModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeNewsModal(e) { if (e.target === document.getElementById('newsModalOverlay')) closeNewsModalDirect(); }
function closeNewsModalDirect() {
  document.getElementById('newsModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── RENDER: SPOTLIGHT ──────────────────────────────────────── */
function playerFromLeaderboardRow(row) {
  const full = players.find(p => p.id === Number(row.playerId));
  if (full) return { ...full, spotlightValue: row.val, spotlightCategory: activeLbCategory };

  const name = row.name || 'NBA Player';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  return {
    id: Number(row.playerId),
    name,
    initials,
    team: row.teamAbbr || 'NBA',
    teamAbbr: row.teamAbbr || 'NBA',
    teamColor: row.teamColor || '#B8962E',
    image: row.avatarUrl || null,
    position: '',
    ppg: Number(row.val || 0),
    rpg: 0,
    apg: 0,
    spotlightValue: row.val,
    spotlightCategory: activeLbCategory,
  };
}

function getSpotlightFeaturedPlayers() {
  const lbRows = leaderboards.points || [];
  if (lbRows.length) return lbRows.slice(0, 3).map(playerFromLeaderboardRow);
  return players.filter(p => p.ppg > 0).sort((a,b) => b.ppg - a.ppg).slice(0,3);
}

function renderSpotlight() {
  const container = document.getElementById('spotlightGrid');
  if (!container) return;

  const featured = getSpotlightFeaturedPlayers();

  if (!featured.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px">No player data found.</p>';
    return;
  }

  // Resolve each player's spotlight background: SPOTLIGHT_IMAGES config first, then DB image fallback
  const spotlightBgs = featured.map(p => SPOTLIGHT_IMAGES[p.name] || p.image || '');

  container.innerHTML = featured.map((p, i) => `
    <div class="spotlight-card" style="--team-color:${p.teamColor};--player-img:url('${p.image || ''}')"
         onclick="openPlayerModal(${p.id})"
         onmouseenter="updateSpotlightBg(${i}, '${p.name.replace(/'/g,"\\'")}', '${p.teamName || p.teamAbbr || ''}', '${(p.ppg||0).toFixed(1)} PPG')"
         onmouseleave="resetSpotlightBg()">
      ${p.image ? `<div class="spotlight-card-bg" style="background-image:url('${p.image}')"></div>` : ''}
      <div class="spotlight-card-overlay"></div>
      <div class="sp-top">
        <div class="sp-avatar" style="border-color:${p.teamColor}44;background:${p.teamColor}15">
          ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'">` : ''}
          <span style="color:${p.teamColor}">${p.initials}</span>
        </div>
        <div>
          <div class="sp-name">${p.name}</div>
          <div class="sp-team">${p.teamAbbr}</div>
        </div>
        <div class="sp-pos">${p.position}</div>
      </div>
      <div class="sp-stats">
        <div class="sp-stat"><div class="sp-stat-val">${p.ppg.toFixed(1)}</div><div class="sp-stat-lbl">PPG</div></div>
        <div class="sp-stat"><div class="sp-stat-val">${p.rpg.toFixed(1)}</div><div class="sp-stat-lbl">RPG</div></div>
        <div class="sp-stat"><div class="sp-stat-val">${p.apg.toFixed(1)}</div><div class="sp-stat-lbl">APG</div></div>
      </div>
    </div>
  `).join('');

  // Populate the three <img> slots in #spotlightBgImage with the resolved URLs
  const bgContainer = document.getElementById('spotlightBgImage');
  if (bgContainer) {
    const bgImgs = bgContainer.querySelectorAll('img');
    spotlightBgs.forEach((src, i) => { if (bgImgs[i]) bgImgs[i].src = src; });
    bgImgs.forEach((img, i) => img.classList.toggle('active', i === 0));
  }
}

function updateSpotlightBg(index, name, team, stat) {
  const bgContainer = document.getElementById('spotlightBgImage');
  const ach = document.getElementById('spotlightAchievement');
  if (bgContainer) {
    const bgImgs = bgContainer.querySelectorAll('img');
    bgImgs.forEach((img, i) => img.classList.toggle('active', i === index));
  }
  if (ach && name) {
    ach.innerHTML = `<strong style="color:var(--white);font-family:var(--font-display);font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;">${name}</strong><br><span style="color:var(--gold);font-size:13px;">${team}</span><br><span style="color:var(--muted);font-size:12px;margin-top:4px;display:block;">${stat} this season</span>`;
  }
}

function resetSpotlightBg() {
  const ach = document.getElementById('spotlightAchievement');
  if (ach) ach.innerHTML = '<p>The top scoring leaders set the spotlight rotation.</p>';
}

/* ── ON THIS DAY ────────────────────────────────────────────── */
const NBA_HISTORY_FACTS = [
  { year: 1962, event: "Wilt Chamberlain scores 100 points in a single game — an unbroken NBA record that may stand forever." },
  { year: 1984, event: "Michael Jordan is drafted 3rd overall by the Chicago Bulls, beginning the greatest individual career in NBA history." },
  { year: 1992, event: "The original Dream Team wins gold at the Barcelona Olympics — Jordan, Magic, Bird, Barkley on one roster." },
  { year: 1995, event: "Michael Jordan returns from retirement with two words: 'I'm back.' He scores 55 points in his 5th game." },
  { year: 2016, event: "LeBron James completes the greatest Finals comeback in history, winning from 3-1 down to give Cleveland its first title." },
  { year: 2019, event: "Kawhi Leonard's buzzer-beater bounces on the rim four times before falling — the only walk-off Game 7 in NBA history." },
  { year: 2016, event: "Steph Curry shatters the 3-point record with 402. The Warriors finish 73–9." },
  { year: 1987, event: "Magic Johnson hits his iconic 'junior sky-hook' to beat the Celtics in Game 4 of the NBA Finals." },
  { year: 2003, event: "LeBron James is selected first overall by the Cleveland Cavaliers at just 18 years old." },
  { year: 2020, event: "The NBA bubble at Walt Disney World becomes the most unique experiment in sports history." },
];

function renderOTD() {
  const today = new Date();
  const el    = document.getElementById('otdDate');
  const body  = document.getElementById('otdBody');
  if (el) el.textContent = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const base = today.getDate() % NBA_HISTORY_FACTS.length;
  const idx  = (base + otdIndex) % NBA_HISTORY_FACTS.length;
  const fact = NBA_HISTORY_FACTS[idx];
  if (body) body.innerHTML = `<div class="otd-event-year">${fact.year}</div><div class="otd-event-text">${fact.event}</div>`;
}

function cycleOTD() {
  otdIndex = (otdIndex + 1) % NBA_HISTORY_FACTS.length;
  renderOTD();
}

/* ── PLAYERS TABLE ──────────────────────────────────────────── */
function getFilteredPlayers() {
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const teamId = parseInt(document.getElementById('teamFilter')?.value || '0') || null;
  const pos    = document.getElementById('positionFilter')?.value || '';
  const sort   = document.getElementById('sortSelect')?.value || 'ppg-desc';

  let list = [...players];
  if (showFavoritesOnly) list = list.filter(p => favorites.has(p.id));
  if (activePos !== 'ALL') list = list.filter(p => p.position === activePos);
  if (teamId)   list = list.filter(p => p.teamId === teamId);
  if (pos)      list = list.filter(p => p.position === pos);
  if (search)   list = list.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.team.toLowerCase().includes(search) ||
    p.teamAbbr.toLowerCase().includes(search));

  const [field, dir] = sort.split('-');
  list.sort((a, b) => {
    let av = a[field], bv = b[field];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av === '—') av = dir === 'desc' ? -1 : 9999;
    if (bv === '—') bv = dir === 'desc' ? -1 : 9999;
    return dir === 'desc' ? bv - av : av - bv;
  });
  return list;
}

function renderPlayers() {
  const container = document.getElementById('playersContainer');
  const list = getFilteredPlayers();
  const total = list.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > maxPage) currentPage = maxPage;
  const paginated = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  document.getElementById('playerCount').textContent = `${total} player${total !== 1 ? 's' : ''} found`;

  if (!total) {
    container.innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center">No players match your filters.</p>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  container.innerHTML = viewMode === 'table' ? playersTable(paginated) : playersGrid(paginated);
  renderPagination(total, maxPage);
}

function playersTable(list) {
  return `
    <div class="players-table-wrap">
      <table class="players-table">
        <thead>
          <tr>
            <th onclick="sortTable('name')">Player</th>
            <th onclick="sortTable('position')">Pos</th>
            <th onclick="sortTable('ppg')"><div class="stat-tooltip-wrap">PPG<span class="stat-tooltip">Points Per Game</span></div></th>
            <th onclick="sortTable('rpg')"><div class="stat-tooltip-wrap">RPG<span class="stat-tooltip">Rebounds Per Game</span></div></th>
            <th onclick="sortTable('apg')"><div class="stat-tooltip-wrap">APG<span class="stat-tooltip">Assists Per Game</span></div></th>
            <th onclick="sortTable('spg')"><div class="stat-tooltip-wrap">SPG<span class="stat-tooltip">Steals Per Game</span></div></th>
            <th onclick="sortTable('bpg')"><div class="stat-tooltip-wrap">BPG<span class="stat-tooltip">Blocks Per Game</span></div></th>
            <th onclick="sortTable('fgp')"><div class="stat-tooltip-wrap">FG%<span class="stat-tooltip">Field Goal Percentage</span></div></th>
            <th onclick="sortTable('tpp')"><div class="stat-tooltip-wrap">3PT%<span class="stat-tooltip">Three-Point Percentage</span></div></th>
            <th onclick="sortTable('gamesPlayed')">GP</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((p, i) => `
            <tr onclick="openPlayerModal(${p.id})">
              <td>
                <div class="td-player">
                  <div class="td-avatar" style="background:${p.teamColor}22">
                    ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'">` : ''}
                    <span style="color:${p.teamColor}">${p.initials}</span>
                  </div>
                  <div>
                    <div class="td-name">${p.name}</div>
                    <div class="td-team" style="color:${p.teamColor}">${p.teamAbbr}</div>
                  </div>
                </div>
              </td>
              <td><span class="td-pos">${p.position}</span></td>
              <td><span class="td-stat ${i < 3 ? 'top' : ''}">${p.ppg > 0 ? p.ppg.toFixed(1) : '—'}</span></td>
              <td><span class="td-stat">${p.rpg > 0 ? p.rpg.toFixed(1) : '—'}</span></td>
              <td><span class="td-stat">${p.apg > 0 ? p.apg.toFixed(1) : '—'}</span></td>
              <td><span class="td-stat">${p.spg > 0 ? p.spg.toFixed(1) : '—'}</span></td>
              <td><span class="td-stat">${p.bpg > 0 ? p.bpg.toFixed(1) : '—'}</span></td>
              <td><span class="td-stat">${p.fgp !== '—' ? p.fgp + '%' : '—'}</span></td>
              <td><span class="td-stat">${p.tpp !== '—' ? p.tpp + '%' : '—'}</span></td>
              <td><span class="td-stat">${p.gamesPlayed || '—'}</span></td>
              <td onclick="event.stopPropagation()">
                <button class="pc-btn pc-btn-fav ${favorites.has(p.id)?'active':''}" style="padding:5px 10px;font-size:11px" onclick="toggleFavorite(${p.id},this)">☆</button>
                <button class="pc-btn pc-btn-compare ${compareSet.has(p.id)?'active':''}" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="toggleCompare(${p.id},this)">⚖</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function playersGrid(list) {
  if (!list.length) return '<p style="color:var(--muted);padding:40px;text-align:center">No players match.</p>';
  return `<div class="players-grid">${list.map(p => playerCard(p)).join('')}</div>`;
}

function playerCard(p) {
  const isFav = favorites.has(p.id);
  const isCmp = compareSet.has(p.id);
  return `
    <div class="player-card" style="--team-color:${p.teamColor}" onclick="openPlayerModal(${p.id})">
      <div class="pc-top">
        <div class="pc-avatar" style="background:${p.teamColor}22;border-color:${p.teamColor}44">
          ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'">` : ''}
          <span style="color:${p.teamColor}">${p.initials}</span>
        </div>
        <div class="pc-info">
          <div class="pc-name">${p.name}</div>
          <div class="pc-team">${p.teamAbbr} · ${p.team}</div>
        </div>
        <div class="pc-pos">${p.position}</div>
      </div>
      <div class="pc-stats">
        <div class="pc-stat"><div class="pc-stat-val">${p.ppg > 0 ? p.ppg.toFixed(1) : '—'}</div><div class="pc-stat-lbl">PPG</div></div>
        <div class="pc-stat"><div class="pc-stat-val">${p.rpg > 0 ? p.rpg.toFixed(1) : '—'}</div><div class="pc-stat-lbl">RPG</div></div>
        <div class="pc-stat"><div class="pc-stat-val">${p.apg > 0 ? p.apg.toFixed(1) : '—'}</div><div class="pc-stat-lbl">APG</div></div>
      </div>
      <div class="pc-actions" onclick="event.stopPropagation()">
        <button class="pc-btn pc-btn-fav ${isFav ? 'active' : ''}" onclick="toggleFavorite(${p.id},this)">${isFav ? '★' : '☆'} Fav</button>
        <button class="pc-btn pc-btn-compare ${isCmp ? 'active' : ''}" onclick="toggleCompare(${p.id},this)">⚖ Compare</button>
      </div>
    </div>`;
}

function renderPagination(total, maxPage) {
  const pag = document.getElementById('pagination');
  if (maxPage <= 1) { pag.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goToPage(${currentPage-1})" ${currentPage===1?'disabled':''}>← Prev</button>`;
  for (let i = 1; i <= maxPage; i++) {
    if (i === 1 || i === maxPage || Math.abs(i - currentPage) <= 2) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="color:var(--muted2);padding:0 4px">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goToPage(${currentPage+1})" ${currentPage===maxPage?'disabled':''}>Next →</button>`;
  pag.innerHTML = html;
}

function goToPage(n) {
  const list = getFilteredPlayers();
  const maxPage = Math.ceil(list.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(n, maxPage));
  renderPlayers();
  scrollToSection('players');
}

/* ── FILTER CONTROLS ────────────────────────────────────────── */
function setView(mode, btn) {
  viewMode = mode; currentPage = 1;
  document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPlayers();
}

function setPos(pos, btn) {
  activePos = pos; currentPage = 1;
  document.querySelectorAll('.pos-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPlayers();
}

function clearSearch() {
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  document.getElementById('searchClear')?.classList.remove('visible');
  currentPage = 1;
  renderPlayers();
}

function resetFilters() {
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  const tf = document.getElementById('teamFilter');    if (tf)  tf.value  = '';
  const pf = document.getElementById('positionFilter');if (pf)  pf.value  = '';
  const sf = document.getElementById('sortSelect');    if (sf)  sf.value  = 'ppg-desc';
  activePos = 'ALL'; currentPage = 1; showFavoritesOnly = false;
  document.querySelectorAll('.pos-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('searchClear')?.classList.remove('visible');
  renderPlayers();
}

function sortTable(field) {
  const sel = document.getElementById('sortSelect');
  if (sel) {
    const [cf, cd] = (sel.value || 'ppg-desc').split('-');
    sel.value = (cf === field && cd === 'desc') ? `${field}-asc` : `${field}-desc`;
  }
  currentPage = 1;
  renderPlayers();
}

function populateTeamFilter() {
  const sel = document.getElementById('teamFilter');
  if (!sel) return;
  const unique = [...new Map(players.filter(p => p.teamId).map(p => [p.teamId, p])).values()];
  unique.sort((a, b) => a.team.localeCompare(b.team));
  sel.innerHTML = '<option value="">All Teams</option>' +
    unique.map(p => `<option value="${p.teamId}">${p.team}</option>`).join('');
}

/* ── FAVORITES ──────────────────────────────────────────────── */
function toggleFavorite(id, btn) {
  // Prompt login if not authenticated
  if (!localStorage.getItem('cs_user')) {
    const overlay = document.getElementById('authGateOverlay');
    if (overlay) { overlay.style.display = 'flex'; }
    else { window.location.href = 'login.html'; }
    return;
  }
  if (favorites.has(id)) {
    favorites.delete(id);
    if (btn) { btn.classList.remove('active'); btn.textContent = '☆ Fav'; }
    showToast('Removed from favorites', 'info');
  } else {
    favorites.add(id);
    if (btn) { btn.classList.add('active'); btn.textContent = '★ Fav'; }
    showToast('Added to favorites ★', 'success');
  }
  localStorage.setItem('cs_favorites', JSON.stringify([...favorites]));
  updateFavBadge();
}

function toggleFavoriteFromModal() {
  if (!currentPlayerModal) return;
  const btn = document.getElementById('pmFavBtn');
  toggleFavorite(currentPlayerModal, btn);
  if (btn) btn.classList.toggle('active', favorites.has(currentPlayerModal));
  btn.textContent = favorites.has(currentPlayerModal) ? '★ Favorited' : '☆ Favorite';
}

function updateFavBadge() {
  const badge = document.getElementById('favBadge');
  const cnt   = document.getElementById('favCount');
  if (!badge) return;
  badge.style.display = favorites.size > 0 ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent = favorites.size;
}

function toggleFavoritesFilter() {
  showFavoritesOnly = !showFavoritesOnly;
  currentPage = 1;
  renderPlayers();
}

/* ── COMPARE ────────────────────────────────────────────────── */
function toggleCompare(id, btn) {
  if (compareSet.has(id)) {
    compareSet.delete(id);
    if (btn) btn.classList.remove('active');
  } else if (compareSet.size < 2) {
    compareSet.add(id);
    if (btn) btn.classList.add('active');
    if (compareSet.size === 2) showToast('Compare players selected — click Compare →', 'info');
  } else {
    showToast('Max 2 players for comparison', 'info');
    return;
  }
  updateCompareBar();
}

function toggleCompareFromModal() {
  if (!currentPlayerModal) return;
  const btn = document.getElementById('pmCompareBtn');
  toggleCompare(currentPlayerModal, null);
  btn.classList.toggle('active', compareSet.has(currentPlayerModal));
}

function updateCompareBar() {
  const bar   = document.getElementById('compareBar');
  const count = document.getElementById('compareCount');
  const slots = document.getElementById('compareSlots');
  const go    = document.getElementById('compareGoBtn');
  if (!bar) return;
  bar.classList.toggle('show', compareSet.size > 0);
  count.textContent = `${compareSet.size} / 2`;
  go.disabled = compareSet.size < 2;
  const ids = [...compareSet];
  slots.innerHTML = Array.from({length: 2}, (_, i) => {
    const p = ids[i] ? players.find(pl => pl.id === ids[i]) : null;
    return p
      ? `<div class="compare-slot"><span class="compare-slot-name">${p.name}</span><span class="compare-slot-remove" onclick="toggleCompare(${p.id},null)">✕</span></div>`
      : `<div class="compare-slot"><span class="compare-slot-empty">+ Add player</span></div>`;
  }).join('');
}

function clearCompare() { compareSet.clear(); updateCompareBar(); renderPlayers(); }

function openCompareModal() {
  const ids = [...compareSet];
  if (ids.length < 2) return;
  const [p1, p2] = ids.map(id => players.find(p => p.id === id));
  if (!p1 || !p2) return;

  const stats = [
    { label:'PPG', k:'ppg' }, { label:'RPG', k:'rpg' }, { label:'APG', k:'apg' },
    { label:'SPG', k:'spg' }, { label:'BPG', k:'bpg' },
  ];
  const max = {};
  stats.forEach(s => { max[s.k] = Math.max(p1[s.k], p2[s.k]) || 1; });

  const body = document.getElementById('compareBody');
  body.innerHTML = `
    <div class="compare-players-row">
      ${[p1,p2].map(p => `
        <div class="cpr-player">
          <div class="cpr-avatar" style="background:${p.teamColor}22;border-color:${p.teamColor}55">
            ${p.image ? `<img src="${p.image}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ''}
            <span style="color:${p.teamColor}">${p.initials}</span>
          </div>
          <div class="cpr-name">${p.name}</div>
          <div class="cpr-meta">${p.teamAbbr} · ${p.position}</div>
        </div>`).join('')}
    </div>
    <div class="compare-stat-rows">
      ${stats.map(s => {
        const v1 = p1[s.k], v2 = p2[s.k];
        const w1 = (v1/max[s.k]*100).toFixed(0);
        const w2 = (v2/max[s.k]*100).toFixed(0);
        const better = v1 > v2 ? 'left' : (v2 > v1 ? 'right' : 'tie');
        return `<div class="csr">
          <div class="csr-label">${s.label}</div>
          <div class="csr-bars">
            <div class="csr-val-left" style="color:${better==='left'?'var(--gold)':'var(--white)'}">${v1.toFixed(1)}</div>
            <div>
              <div class="csr-track" style="margin-bottom:4px">
                <div class="csr-fill" style="width:0%;background:${p1.teamColor}" data-w="${w1}%"></div>
              </div>
              <div class="csr-track">
                <div class="csr-fill" style="width:0%;background:${p2.teamColor}" data-w="${w2}%"></div>
              </div>
            </div>
            <div class="csr-val-right" style="color:${better==='right'?'var(--gold)':'var(--white)'}">${v2.toFixed(1)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  document.getElementById('compareModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    setTimeout(() => {
      body.querySelectorAll('.csr-fill[data-w]').forEach(f => f.style.width = f.dataset.w);
    }, 100);
  });
}

function closeCompareModal(e) { if (e.target === document.getElementById('compareModalOverlay')) closeCompareModalDirect(); }
function closeCompareModalDirect() {
  document.getElementById('compareModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── RENDER: TEAMS ──────────────────────────────────────────── */
function setConference(conf, btn) {
  activeConf = conf;
  document.querySelectorAll('.conf-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTeams();
}

function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  if (!grid) return;
  const filtered = teams.filter(t => activeConf === 'ALL' || t.conference === activeConf);

  if (!filtered.length) {
    grid.innerHTML = '<p style="color:var(--muted);padding:20px">No team data found.</p>';
    return;
  }

  grid.innerHTML = filtered.map(t => `
    <div class="team-card" onclick="openTeamModal('${t.abbrev}')">
      <div class="team-card-banner" style="background:linear-gradient(90deg,${t.primaryColor},${t.secondaryColor})"></div>
      <div class="team-card-body">
        <img class="team-card-logo" src="${t.logoUrl}" alt="${t.name}"
             onerror="this.src='https://a.espncdn.com/i/teamlogos/nba/500/${t.abbrev.toLowerCase()}.png';this.onerror=null">
        <div class="team-card-name">${t.shortName || t.name}</div>
        <div class="team-card-conf">${t.conference} · ${t.division}</div>
        <div class="team-card-stats">
          <div class="tc-stat"><div class="tc-stat-val">${t.championships}</div><div class="tc-stat-lbl">Titles</div></div>
          <div class="tc-stat"><div class="tc-stat-val">${t.rosterCount}</div><div class="tc-stat-lbl">Players</div></div>
          ${t.founded ? `<div class="tc-stat"><div class="tc-stat-val">${t.founded}</div><div class="tc-stat-lbl">Founded</div></div>` : ''}
        </div>
      </div>
    </div>`).join('');
}

/* ── RENDER: STAT CARDS ─────────────────────────────────────── */
function renderStatCards() {
  const top    = scoringData[0];
  const top3   = threePtData[0];
  const topApg = players.filter(p => p.apg > 0).sort((a,b) => b.apg - a.apg)[0];
  const topBpg = players.filter(p => p.bpg > 0).sort((a,b) => b.bpg - a.bpg)[0];

  if (top) { document.getElementById('sc1').textContent = Number(top.ppg).toFixed(1); document.getElementById('sc1Label').textContent = `${top.name} · Top Scorer`; }
  if (top3) {
    const pct = top3.three_pt_pct || top3.three_point_pct;
    document.getElementById('sc2').textContent = (Number(pct)*100).toFixed(1) + '%';
    document.getElementById('sc2Label').textContent = `${top3.name} · Top 3PT%`;
  }
  if (topApg) { document.getElementById('sc3').textContent = topApg.apg.toFixed(1); document.getElementById('sc3Label').textContent = `${topApg.name} · Top Assists`; }
  if (topBpg) { document.getElementById('sc4').textContent = topBpg.bpg.toFixed(1); document.getElementById('sc4Label').textContent = `${topBpg.name} · Top Blocks`; }
}

/* ── RENDER: CHARTS (descending bars) ──────────────────────── */
function renderScoringChart() {
  const el = document.getElementById('scoringChart');
  if (!el || !scoringData.length) return;

  // Sort descending to ensure visual order
  const data = [...scoringData].sort((a, b) => Number(b.ppg) - Number(a.ppg)).slice(0, 8);
  const maxVal = Math.max(...data.map(d => Number(d.ppg)));
  const minVal = Math.min(...data.map(d => Number(d.ppg)));
  const range  = maxVal - minVal || 1;

  el.innerHTML = `<div class="bar-chart">${
    data.map((d, i) => {
      const val = Number(d.ppg);
      // Scale: min gets 30%, max gets 100% — ensures visible size difference
      const pct = (30 + ((val - minVal) / range) * 70).toFixed(1);
      const isTop3 = i < 3;
      const color  = isTop3
        ? `linear-gradient(90deg, var(--gold), var(--gold2))`
        : `linear-gradient(90deg, var(--bg5), var(--bg4))`;
      return `
        <div class="bar-row">
          <span class="bar-rank">${i+1}</span>
          <span class="bar-label" title="${d.name}">${d.name}</span>
          <div class="bar-track">
            <div class="bar-fill" style="background:${color};width:0%" data-width="${pct}%">
              <span class="bar-val">${val.toFixed(1)}</span>
            </div>
          </div>
        </div>`;
    }).join('')
  }</div>`;

  setTimeout(() => {
    el.querySelectorAll('.bar-fill[data-width]').forEach(b => { b.style.width = b.dataset.width; });
  }, 100);
}

function renderThreePtChart() {
  const el = document.getElementById('threePtChart');
  if (!el || !threePtData.length) return;

  const raw = threePtData.filter(d => d.three_pt_pct || d.three_point_pct);
  
  const data = [...raw].sort((a, b) => {
    return Number(b.three_pt_pct || b.three_point_pct) - Number(a.three_pt_pct || a.three_point_pct);
  }).slice(0, 8);

  const vals   = data.map(d => Number(d.three_pt_pct || d.three_point_pct));
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const range  = maxVal - minVal || 0.001;

  el.innerHTML = `<div class="bar-chart">${
    data.map((d, i) => {
      const val    = Number(d.three_pt_pct || d.three_point_pct);
      const pct    = (30 + ((val - minVal) / range) * 70).toFixed(1);
      const display = (val * 100).toFixed(1) + '%';
      const isTop3  = i < 3;
      const color   = isTop3
        ? `linear-gradient(90deg, var(--gold), var(--gold2))`
        : `linear-gradient(90deg, var(--bg5), var(--bg4))`;
      return `
        <div class="bar-row">
          <span class="bar-rank">${i+1}</span>
          <span class="bar-label" title="${d.name}">${d.name}</span>
          <div class="bar-track">
            <div class="bar-fill" style="background:${color};width:0%" data-width="${pct}%">
              <span class="bar-val">${display}</span>
            </div>
          </div>
        </div>
      `;
    }).join('')
  }</div>`;

  setTimeout(() => {
    el.querySelectorAll('.bar-fill[data-width]').forEach(b => { b.style.width = b.dataset.width; });
  }, 100);
}
/* ── SHOT HEATMAP (court fixed left, stats right) ────────────── */
function populateHeatmapSelect() {
  const sel = document.getElementById('heatmapPlayerSelect');
  if (!sel) return;
  const topPlayers = players.filter(p => p.ppg > 0).sort((a,b) => b.ppg - a.ppg).slice(0, 25);
  topPlayers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.teamAbbr})`;
    sel.appendChild(opt);
  });
}

function renderHeatmap(playerId) {
  const container = document.getElementById('heatmapContainer');
  if (!playerId || !container) return;

  const player = players.find(p => p.id === Number(playerId));
  if (!player) return;

  const fgp  = parseFloat(player.fgp) / 100 || 0.45;
  const tpp  = parseFloat(player.tpp) / 100 || 0.35;
  const pos  = player.position;
  const zones = generateShotZones(pos, fgp, tpp);

  container.innerHTML = `
    <div class="heatmap-layout">
      <div class="heatmap-court-wrap">
        <div style="text-align:center;margin-bottom:10px;font-size:12px;color:var(--muted)">
          <strong style="color:var(--white)">${player.name}</strong> &nbsp;·&nbsp; ${player.gamesPlayed || '—'} GP
        </div>
        <div class="heatmap-court" style="position:relative">
          ${renderCourtLines()}
          ${zones.map(z => `
            <div class="hm-shot hm-${z.temp}"
                 style="left:${z.x}%;bottom:${z.y}%;width:${10+z.freq*8}px;height:${10+z.freq*8}px;transform:translate(-50%, 50%)"
                 title="${z.label}: ${(z.pct*100).toFixed(0)}%"></div>
          `).join('')}
        </div>
      </div>

      <div class="heatmap-stats-panel">
        <div class="heatmap-stats-title">ZONE EFFICIENCY</div>
        ${zones.map(z => `
          <div class="heatmap-zone-row">
            <div class="heatmap-zone-dot hm-dot-${z.temp}"></div>
            <div class="heatmap-zone-label">${z.label}</div>
            <div class="heatmap-zone-pct">${(z.pct*100).toFixed(0)}%</div>
          </div>
        `).join('')}
        <div class="heatmap-note">
          * Estimated from season stats.<br>Actual charts require play-by-play data.
        </div>
      </div>
    </div>`;
}

function renderCourtLines() {
  // SVG-based court with properly curved lines matching real NBA half-court
  return `
    <svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 320 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>.cl{fill:none;stroke:rgba(255,255,255,0.28);stroke-width:1.5;stroke-linecap:round}</style>
      </defs>
      <!-- Baseline -->
      <line class="cl" x1="0" y1="298" x2="320" y2="298"/>
      <!-- Sidelines partial -->
      <line class="cl" x1="0" y1="0" x2="0" y2="298"/>
      <line class="cl" x1="320" y1="0" x2="320" y2="298"/>
      <!-- Paint / key box -->
      <rect class="cl" x="110" y="172" width="100" height="126" fill="rgba(255,255,255,0.03)"/>
      <!-- Free-throw circle (top arc only) -->
      <path class="cl" d="M110,172 A50,50 0 0,0 210,172"/>
      <!-- Restricted area arc -->
      <path class="cl" d="M142,298 A18,18 0 0,0 178,298"/>
      <!-- 3-point arc - smooth wide curve -->
      <path class="cl" d="M30,298 C30,140 290,140 290,298"/>
      <!-- Corner 3 lines -->
      <line class="cl" x1="30" y1="298" x2="30" y2="220"/>
      <line class="cl" x1="290" y1="298" x2="290" y2="220"/>
      <!-- Center circle top half -->
      <path class="cl" d="M126,172 A34,34 0 0,1 194,172"/>
      <!-- Backboard -->
      <line style="stroke:rgba(255,255,255,0.5);stroke-width:2" x1="142" y1="298" x2="178" y2="298"/>
      <!-- Basket dot -->
      <circle cx="160" cy="285" r="7" fill="none" stroke="#e03a3e" stroke-width="2"/>
    </svg>
  `;
}

function generateShotZones(position, fgp, tpp) {
  const isGuard   = ['PG','SG'].includes(position);
  const isForward = ['SF','PF'].includes(position);
  const isCenter  = position === 'C';

  // FIXED: All Left/Right coordinates are now perfectly symmetrical!
  const zones = [
    { label:'Paint / Close',    x:50, y:15, pct: isCenter ? fgp*1.2 : fgp*0.85, freq: isCenter ? 2.5 : 1.5, temp: 'hot' },
    { label:'Left Elbow',       x:28, y:38, pct: fgp*0.92, freq: 1.2, temp: 'warm' },
    { label:'Right Elbow',      x:72, y:38, pct: fgp*0.94, freq: 1.3, temp: 'warm' },
    { label:'Left Corner 3',    x:5,  y:15, pct: tpp,      freq: isGuard ? 2 : 0.8, temp: tpp > 0.38 ? 'hot' : 'cold' },
    { label:'Right Corner 3',   x:95, y:15, pct: tpp*1.02, freq: isGuard ? 1.8 : 0.7, temp: tpp > 0.38 ? 'hot' : 'cold' },
    { label:'Left Wing 3',      x:15, y:58, pct: tpp*0.95, freq: isGuard ? 1.5 : 0.6, temp: tpp > 0.35 ? 'warm' : 'cold' },
    { label:'Right Wing 3',     x:85, y:58, pct: tpp*0.93, freq: isGuard ? 1.4 : 0.5, temp: tpp > 0.35 ? 'warm' : 'cold' },
    { label:'Top of the Arc 3', x:50, y:72, pct: tpp*0.9,  freq: isGuard ? 2 : 0.4, temp: tpp > 0.38 ? 'hot' : (tpp > 0.32 ? 'warm' : 'cold') },
    { label:'Midrange (L)',     x:22, y:45, pct: fgp*0.85, freq: isForward ? 1.6 : 1, temp: 'warm' },
    { label:'Midrange (R)',     x:78, y:45, pct: fgp*0.87, freq: isForward ? 1.5 : 0.9, temp: 'warm' },
  ];

  return zones.map(z => ({ ...z, pct: Math.min(0.95, Math.max(0.1, z.pct)) }));
}


/* ── RENDER: LEADERBOARD ────────────────────────────────────── */
function setLbTab(btn, cat) {
  activeLbCategory = cat;
  document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLeaderboard();
}

function renderLeaderboard() {
  const container = document.getElementById('lbContainer');
  if (!container) return;
  const data = leaderboards[activeLbCategory];
  if (!data || !data.length) { container.innerHTML = '<div class="lb-skeleton"></div>'; return; }

  container.innerHTML = `<div class="lb-list">${
    data.map((d, i) => `
      <div class="lb-row" style="--team-color:${d.teamColor}" onclick="openPlayerModal(${d.playerId})">
        <div class="lb-rank">${i+1}</div>
        <div class="lb-avatar">
          ${d.avatarUrl ? `<img src="${d.avatarUrl}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : ''}
          <span style="color:${d.teamColor}">${d.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</span>
        </div>
        <div class="lb-info">
          <div class="lb-name">${d.name}</div>
          <div class="lb-meta">${d.teamAbbr} · ${activeLbCategory}</div>
        </div>
        <div class="lb-val">${d.val}</div>
      </div>`)
    .join('')
  }</div>`;
}  setTimeout(() => {
    container.querySelectorAll('.lb-bar-fill[data-w]').forEach(b => { b.style.width = b.dataset.w; });
  }, 100);

/* ── RENDER: VERTICAL TIMELINE (static in HTML, no DB needed) ── */
function renderTimeline() {
  // The vertical timeline is fully static HTML in index.html
  // This function is kept for backward compatibility but does nothing.
  // DB-driven events could be injected here in the future.
}

function renderHistoryFallback() {
  // Timeline is static HTML now — nothing to fall back to
}

/* ── COURT MOMENTS: ICONIC NBA MOMENTS GALLERY ───────────────── */
// Curated list of iconic NBA moments with contextually relevant images
const COURT_MOMENTS = [
  {
    year: '1962',
    title: "Wilt's 100-Point Night",
    desc: "March 2, 1962 — Hershey, PA. Wilt Chamberlain drops 100 points on the New York Knicks in a game so extraordinary no official film exists. The only evidence: a handwritten scorecard and a locker-room photo with the number 100 scrawled on paper.",
    credit: 'Philadelphia Warriors vs New York Knicks',
    img: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1400&q=85',
  },
  {
    year: '1984',
    title: "Jordan's First Flight",
    desc: "Michael Jordan wins the 1984 Slam Dunk Contest as a rookie, launching himself from the free-throw line in a moment that defined an era. His Airness was not a metaphor — it was a category.",
    credit: 'Chicago Bulls · 1984 NBA Dunk Contest',
    img: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=1400&q=85',
  },
  {
    year: '1987',
    title: "Magic's Junior Sky Hook",
    desc: "Game 4 of the 1987 NBA Finals. Magic Johnson — a point guard — catches the ball on the right low block with two seconds left and banks in a sky hook over Kevin McHale and Robert Parish. Lakers win. Celtics dynasty ends.",
    credit: 'Los Angeles Lakers vs Boston Celtics',
    img: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&q=85',
  },
  {
    year: '1992',
    title: "The Dream Team in Barcelona",
    desc: "The 1992 US Olympic Basketball Team is widely considered the greatest collection of basketball talent ever assembled. Jordan, Magic, Bird, Barkley, Ewing, Pippen — winning by 44 points per game and making basketball a global religion.",
    credit: '1992 Summer Olympics · Barcelona, Spain',
    img: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1400&q=85',
  },
  {
    year: '1998',
    title: "The Last Shot",
    desc: "With 5.2 seconds left in Game 6 of the 1998 NBA Finals, Michael Jordan steals from Karl Malone, drives, and hits the series-winning jumper over Bryon Russell. He holds the pose. The Bulls' sixth championship. His last shot as a Bull.",
    credit: 'Chicago Bulls vs Utah Jazz · 1998 NBA Finals',
    img: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=1400&q=85',
  },
  {
    year: '2003',
    title: "LeBron Enters the Arena",
    desc: "Eighteen-year-old LeBron James walks into Madison Square Garden for his second NBA game, drops 27 points, and the entire New York crowd gives him a standing ovation. The King had arrived.",
    credit: 'Cleveland Cavaliers · 2003–04 Season',
    img: 'https://images.unsplash.com/photo-1518063319789-7217e6706b04?w=1400&q=85',
  },
  {
    year: '2016',
    title: "The Block Heard Round the World",
    desc: "Game 7. Warriors leading by one. 1:50 remaining. LeBron James sprints 70 feet to swat Andre Iguodala's layup off the glass — a chase-down block that preserved a tie and led to Kyrie Irving's go-ahead three, completing the greatest Finals comeback in history.",
    credit: 'Cleveland Cavaliers vs Golden State Warriors',
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=85',
  },
  {
    year: '2019',
    title: "Kawhi's Four-Bounce Miracle",
    desc: "0.9 seconds. Corner catch. One dribble. A fadeaway that hits the back iron, the front iron, the back iron, the front iron — and falls through. The only walk-off buzzer-beater in Game 7 history. Kawhi Leonard sent Toronto to the Eastern Conference Finals.",
    credit: 'Toronto Raptors vs Philadelphia 76ers · Game 7',
    img: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=1400&q=85',
  },
  {
    year: '2023',
    title: "Jokić Hoists Denver's First Trophy",
    desc: "After 47 years of waiting, the Denver Nuggets win their first NBA championship. Nikola Jokić — a 2nd-round pick from Serbia who averages 30-14-7 in the Finals — lifts the Larry O'Brien trophy, completing one of the most improbable championship runs in modern NBA history.",
    credit: 'Denver Nuggets vs Miami Heat · 2023 NBA Finals',
    img: 'https://images.unsplash.com/photo-1544919982-b61976f0ba43?w=1400&q=85',
  },
];

let momentCarouselIndex = 0;

function loadCourtMoments() {
  const grid = document.getElementById('momentsGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="moments-carousel">
      <button class="mc-arrow mc-prev" onclick="stepMoment(-1)" aria-label="Previous">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button class="mc-arrow mc-next" onclick="stepMoment(1)" aria-label="Next">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      <div class="mc-track-wrap">
        <div class="mc-track" id="mcTrack">
          ${COURT_MOMENTS.map((m, i) => `
            <div class="mc-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
              <img class="mc-bg-img" src="${m.img}" alt="${m.title}"
                   onerror="this.src='https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&q=80'" />
              <div class="mc-overlay"></div>
              <div class="mc-content">
                <div class="mc-year">${m.year}</div>
                <h3 class="mc-title">${m.title}</h3>
                <p class="mc-desc">${m.desc}</p>
                <div class="mc-credit">${m.credit}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="mc-dots" id="mcDots">
        ${COURT_MOMENTS.map((_, i) => `<button class="mc-dot ${i === 0 ? 'active' : ''}" onclick="goToMoment(${i})" aria-label="Moment ${i+1}"></button>`).join('')}
      </div>
    </div>`;

  momentCarouselIndex = 0;
}

function stepMoment(dir) {
  goToMoment((momentCarouselIndex + dir + COURT_MOMENTS.length) % COURT_MOMENTS.length);
}

function goToMoment(idx) {
  const slides = document.querySelectorAll('.mc-slide');
  const dots   = document.querySelectorAll('.mc-dot');
  if (!slides.length) return;

  slides[momentCarouselIndex]?.classList.remove('active');
  dots[momentCarouselIndex]?.classList.remove('active');

  momentCarouselIndex = idx;

  slides[momentCarouselIndex]?.classList.add('active');
  dots[momentCarouselIndex]?.classList.add('active');
}

// Auto-advance carousel every 6s
setInterval(() => {
  if (document.querySelector('.mc-slide')) stepMoment(1);
}, 6000);

function openMomentLightbox(index) {
  const m  = COURT_MOMENTS[index];
  const lb = document.getElementById('momentLightbox');
  if (!lb || !m) return;
  document.getElementById('mlbImg').src    = m.img;
  document.getElementById('mlbImg').alt    = m.title;
  document.getElementById('mlbYear').textContent  = m.year;
  document.getElementById('mlbTitle').textContent = m.title;
  document.getElementById('mlbDesc').textContent  = m.desc;
  document.getElementById('mlbCredit').textContent = m.credit;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMomentLightbox(e) {
  if (e.target === document.getElementById('momentLightbox')) closeMomentLightboxDirect();
}
function closeMomentLightboxDirect() {
  document.getElementById('momentLightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── NAV USER AREA ───────────────────────────────────────────── */
function initNavUser() {
  const area = document.getElementById('navUserArea');
  if (!area) return;
  try {
    const stored = localStorage.getItem('cs_user');
    if (stored) {
      const user = JSON.parse(stored);
      const favCount = favorites.size;
      area.innerHTML = `
        <div class="nav-user-chip" onclick="toggleUserMenu(event)">
          <div class="nav-user-avatar">${(user.display_name || user.username || '?')[0].toUpperCase()}</div>
          <span class="nav-user-name">${user.display_name || user.username}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="nav-user-menu" id="navUserMenu">
          <div class="num-greeting">Hey, ${user.display_name || user.username}! 👋</div>
          <button class="num-item" onclick="openProfileModal()">👤 My Profile</button>
          <button class="num-item" onclick="openFavoritesModal()">★ Favorites <span style="background:var(--orange);color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;margin-left:4px">${favCount}</span></button>
          <div style="height:1px;background:var(--border);margin:6px 0;"></div>
          <button class="num-item" onclick="signOut()">Sign Out</button>
        </div>`;
    }
  } catch(e) { /* no stored user */ }
}

function toggleUserMenu(e) {
  e.stopPropagation();
  document.getElementById('navUserMenu')?.classList.toggle('open');
}
function signOut() {
  localStorage.removeItem('cs_user');
  localStorage.removeItem('cs_token');
  window.location.reload();
}
document.addEventListener('click', () => document.getElementById('navUserMenu')?.classList.remove('open'));

/* ── AUTH GATE: redirect to login if not logged in ───────────── */
function requireAuth(returnPath) {
  const user = localStorage.getItem('cs_user');
  if (!user) {
    const dest = returnPath || window.location.pathname + window.location.hash;
    window.location.href = 'login.html?return=' + encodeURIComponent(dest);
    return false;
  }
  return true;
}

/* ── PROFILE MODAL ───────────────────────────────────────────── */
function openProfileModal() {
  document.getElementById('navUserMenu')?.classList.remove('open');
  let modal = document.getElementById('profileModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'profile-modal-overlay';
    modal.innerHTML = `
      <div class="profile-modal-card">
        <button class="profile-modal-close" onclick="closeProfileModal()">✕</button>
        <div class="profile-modal-header">
          <div class="profile-modal-avatar" id="pmAvatarInitial">?</div>
          <div class="profile-modal-info">
            <div class="profile-modal-name" id="pmDisplayName">—</div>
            <div class="profile-modal-email" id="pmUserEmail">—</div>
          </div>
        </div>

        <div class="profile-modal-tabs">
          <button class="pmt-tab active" onclick="switchProfileTab('overview', this)">Overview</button>
          <button class="pmt-tab" onclick="switchProfileTab('favorites', this)">★ Favorites</button>
          <button class="pmt-tab" onclick="switchProfileTab('edit', this)">Edit Profile</button>
        </div>

        <!-- OVERVIEW -->
        <div id="pmtOverview" class="pmt-panel active">
          <div class="profile-stat-grid" id="profileStatGrid"></div>
          <div style="margin-top:20px">
            <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:12px">Account Info</div>
            <div class="profile-info-row"><span>Username</span><span id="pmUsername">—</span></div>
            <div class="profile-info-row"><span>Email</span><span id="pmEmailRow">—</span></div>
            <div class="profile-info-row"><span>Favorites</span><span id="pmFavCount">0 players</span></div>
          </div>
        </div>

        <!-- FAVORITES -->
        <div id="pmtFavorites" class="pmt-panel">
          <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:14px">Your Favorite Players</div>
          <div id="profileFavGrid" class="profile-fav-grid"></div>
          <div id="profileFavEmpty" style="display:none;text-align:center;padding:32px 0;color:var(--muted);font-size:13px">
            No favorites yet. Tap ☆ on any player card to add them here.
          </div>
        </div>

        <!-- EDIT -->
        <div id="pmtEdit" class="pmt-panel">
          <div class="pm-alert" id="pmEditAlert"></div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="pm-field">
              <label>Username</label>
              <input type="text" id="pmEditUsername" class="pm-input" placeholder="New username" />
            </div>
            <div class="pm-field">
              <label>Display Name</label>
              <input type="text" id="pmEditDisplay" class="pm-input" placeholder="Display name" />
            </div>
            <div class="pm-field">
              <label>Email</label>
              <input type="email" id="pmEditEmail" class="pm-input" placeholder="Email address" />
            </div>
            <div class="pm-field">
              <label>New Password <span style="color:var(--muted);font-size:10px">(leave blank to keep current)</span></label>
              <input type="password" id="pmEditNewPass" class="pm-input" placeholder="New password" />
            </div>
            <div class="pm-field">
              <label>Current Password <span style="color:var(--orange)">*</span></label>
              <input type="password" id="pmEditCurrentPass" class="pm-input" placeholder="Required to save" />
            </div>
            <button class="pm-save-btn" id="pmSaveBtn" onclick="handleProfileUpdate()">
              <div class="btn-spinner" style="display:none;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite"></div>
              <span class="btn-text">Save Changes</span>
            </button>
            <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">
              <button class="pm-delete-btn" onclick="promptDeleteAccount()">Delete My Account</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeProfileModal(); });
  }

  // Populate data
  try {
    const user = JSON.parse(localStorage.getItem('cs_user') || '{}');
    document.getElementById('pmAvatarInitial').textContent = (user.display_name || user.username || '?')[0].toUpperCase();
    document.getElementById('pmDisplayName').textContent = user.display_name || user.username || '—';
    document.getElementById('pmUserEmail').textContent = user.email || '—';
    document.getElementById('pmUsername').textContent = '@' + (user.username || '—');
    document.getElementById('pmEmailRow').textContent = user.email || '—';
    document.getElementById('pmFavCount').textContent = favorites.size + ' players';

    // Pre-fill edit fields
    document.getElementById('pmEditUsername').value = user.username || '';
    document.getElementById('pmEditDisplay').value = user.display_name || '';
    document.getElementById('pmEditEmail').value = user.email || '';

    // Overview stats
    const statGrid = document.getElementById('profileStatGrid');
    statGrid.innerHTML = `
      <div class="profile-stat-item"><div class="psi-val">${favorites.size}</div><div class="psi-lbl">Favorites</div></div>
      <div class="profile-stat-item"><div class="psi-val">${players.length}</div><div class="psi-lbl">Players Tracked</div></div>
      <div class="profile-stat-item"><div class="psi-val">${teams.length || '—'}</div><div class="psi-lbl">Teams</div></div>`;

    // Favorites grid
    renderProfileFavorites();
  } catch(e) {}

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderProfileFavorites() {
  const grid = document.getElementById('profileFavGrid');
  const empty = document.getElementById('profileFavEmpty');
  if (!grid) return;

  const favPlayers = players.filter(p => favorites.has(p.id));
  if (!favPlayers.length) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  grid.style.display = 'grid';

  grid.innerHTML = favPlayers.map(p => `
    <div class="profile-fav-card" onclick="closeProfileModal();setTimeout(()=>openPlayerModal(${p.id}),200)">
      <div class="pfc-avatar" style="background:${p.teamColor}22;border-color:${p.teamColor}44">
        ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'" />` : ''}
        <span>${p.initials}</span>
      </div>
      <div class="pfc-name">${p.name}</div>
      <div class="pfc-team" style="color:${p.teamColor}">${p.teamAbbr}</div>
      <div class="pfc-ppg">${p.ppg.toFixed(1)} PPG</div>
      <button class="pfc-remove" onclick="event.stopPropagation();toggleFavorite(${p.id});renderProfileFavorites();initNavUser()" title="Remove">✕</button>
    </div>`).join('');
}

function openFavoritesModal() {
  document.getElementById('navUserMenu')?.classList.remove('open');
  openProfileModal();
  setTimeout(() => switchProfileTab('favorites', document.querySelector('.pmt-tab:nth-child(2)')), 100);
}

function switchProfileTab(tab, btn) {
  document.querySelectorAll('.pmt-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.pmt-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('pmt' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'favorites') renderProfileFavorites();
}

function closeProfileModal() {
  document.getElementById('profileModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

async function handleProfileUpdate() {
  const btn = document.getElementById('pmSaveBtn');
  const currentPass = document.getElementById('pmEditCurrentPass').value;
  const newUsername = document.getElementById('pmEditUsername').value.trim();
  const displayName = document.getElementById('pmEditDisplay').value.trim();
  const email       = document.getElementById('pmEditEmail').value.trim();
  const newPass     = document.getElementById('pmEditNewPass').value;
  const alertEl     = document.getElementById('pmEditAlert');

  if (!currentPass) {
    alertEl.className = 'pm-alert error show';
    alertEl.textContent = 'Current password is required.';
    return;
  }

  btn.disabled = true;
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.querySelector('.btn-text').style.display = 'none';
  alertEl.className = 'pm-alert';

  try {
    const token = localStorage.getItem('cs_token') || '';
    const AUTH_BASE = '/courtstars/api/auth/';
    const res = await fetch(AUTH_BASE + 'update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ current_password: currentPass, username: newUsername, display_name: displayName, email, new_password: newPass || undefined }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('cs_user', JSON.stringify(data.user));
      if (data.token) localStorage.setItem('cs_token', data.token);
      alertEl.className = 'pm-alert success show';
      alertEl.textContent = 'Profile updated!';
      initNavUser();
      setTimeout(() => openProfileModal(), 300);
    } else {
      alertEl.className = 'pm-alert error show';
      alertEl.textContent = data.error || 'Update failed.';
    }
  } catch(e) {
    alertEl.className = 'pm-alert error show';
    alertEl.textContent = 'Cannot reach server.';
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-spinner').style.display = 'none';
    btn.querySelector('.btn-text').style.display = 'inline';
  }
}

async function promptDeleteAccount() {
  const pass = prompt('Enter your password to permanently delete your account. This cannot be undone.');
  if (!pass) return;
  const alertEl = document.getElementById('pmEditAlert');

  try {
    const token = localStorage.getItem('cs_token') || '';
    const AUTH_BASE = '/courtstars/api/auth/';
    const res = await fetch(AUTH_BASE + 'delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.removeItem('cs_user');
      localStorage.removeItem('cs_token');
      localStorage.removeItem('cs_favorites');
      closeProfileModal();
      showToast('Account deleted. Goodbye! 👋', 'info');
      setTimeout(() => window.location.reload(), 1800);
    } else {
      alertEl.className = 'pm-alert error show';
      alertEl.textContent = data.error || 'Deletion failed. Check your password.';
    }
  } catch(e) {
    alertEl.className = 'pm-alert error show';
    alertEl.textContent = 'Cannot reach server.';
  }
}



/* ── PLAYER MODAL ───────────────────────────────────────────── */
function openPlayerModal(id) {
  const p = players.find(pl => pl.id === id);
  if (!p) return;
  currentPlayerModal = id;

  document.getElementById('pmBg').style.background = `linear-gradient(135deg, ${p.teamColor}30, transparent)`;
  document.getElementById('pmJersey').textContent = p.jersey !== '—' ? `#${p.jersey}` : '';

  const avatar      = document.getElementById('pmAvatar');
  const placeholder = document.getElementById('pmAvatarPlaceholder');
  if (p.image) { avatar.src = p.image; avatar.style.display = 'block'; placeholder.style.display = 'none'; }
  else         { avatar.style.display = 'none'; placeholder.style.display = 'flex'; placeholder.textContent = p.initials; }

  document.getElementById('pmName').textContent = p.name;
  document.getElementById('pmMeta').innerHTML = `
    <span style="color:${p.teamColor}">${p.teamAbbr}</span> · ${p.team} · ${p.position}
    ${p.height !== '—' ? ` · ${p.height}` : ''}
    ${p.country !== '—' ? ` · 🌍 ${p.country}` : ''}`;

  document.getElementById('pmQuick').innerHTML = `
    <div class="mqs-stat"><div class="mqs-val">${p.ppg.toFixed(1)}</div><div class="mqs-lbl">PPG</div></div>
    <div class="mqs-stat"><div class="mqs-val">${p.rpg.toFixed(1)}</div><div class="mqs-lbl">RPG</div></div>
    <div class="mqs-stat"><div class="mqs-val">${p.apg.toFixed(1)}</div><div class="mqs-lbl">APG</div></div>
    <div class="mqs-stat"><div class="mqs-val">${p.fgp !== '—' ? p.fgp+'%' : '—'}</div><div class="mqs-lbl">FG%</div></div>`;

  const favBtn = document.getElementById('pmFavBtn');
  favBtn.textContent = favorites.has(id) ? '★ Favorited' : '☆ Favorite';
  favBtn.classList.toggle('active', favorites.has(id));
  document.getElementById('pmCompareBtn').classList.toggle('active', compareSet.has(id));

  // Overview — per-game stats + shooting splits + advanced stats
  const hasAdv = p.per !== null || p.tsPct !== null;
  document.getElementById('pm-overview').innerHTML = `
    <div class="pm-stat-grid">
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.ppg > 0 ? p.ppg.toFixed(1) : '—'}</div><div class="pm-stat-lbl">PPG</div></div>
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.rpg > 0 ? p.rpg.toFixed(1) : '—'}</div><div class="pm-stat-lbl">RPG</div></div>
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.apg > 0 ? p.apg.toFixed(1) : '—'}</div><div class="pm-stat-lbl">APG</div></div>
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.spg > 0 ? p.spg.toFixed(1) : '—'}</div><div class="pm-stat-lbl">SPG</div></div>
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.bpg > 0 ? p.bpg.toFixed(1) : '—'}</div><div class="pm-stat-lbl">BPG</div></div>
      <div class="pm-stat-cell"><div class="pm-stat-val">${p.gamesPlayed || '—'}</div><div class="pm-stat-lbl">GP</div></div>
    </div>
    <div class="pm-bio-section">
      <div class="pm-bio-title">SHOOTING SPLITS</div>
      <div class="pm-bio-grid">
        <div class="pm-bio-row"><span class="pm-bio-key">FG%</span><span class="pm-bio-val">${p.fgp !== '—' ? p.fgp+'%' : '—'}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">3PT%</span><span class="pm-bio-val">${p.tpp !== '—' ? p.tpp+'%' : '—'}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">FT%</span><span class="pm-bio-val">${p.ftp !== '—' ? p.ftp+'%' : '—'}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">MIN/G</span><span class="pm-bio-val">${p.minutes > 0 ? p.minutes.toFixed(1) : '—'}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">TOV/G</span><span class="pm-bio-val">${p.tov > 0 ? p.tov.toFixed(1) : '—'}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">OREB</span><span class="pm-bio-val">${p.oreb > 0 ? p.oreb.toFixed(1) : '—'}</span></div>
      </div>
    </div>
    ${hasAdv ? `
    <div class="pm-bio-section">
      <div class="pm-bio-title">ADVANCED ANALYTICS <span style="font-size:10px;opacity:.5;font-weight:400">via nba_api</span></div>
      <div class="pm-bio-grid">
        ${p.per    !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">PIE</span><span class="pm-bio-val" title="Player Impact Estimate">${Number(p.per).toFixed(3)}</span></div>` : ''}
        ${p.tsPct  !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">TS%</span><span class="pm-bio-val" title="True Shooting %">${p.tsPct}%</span></div>` : ''}
        ${p.usgPct !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">USG%</span><span class="pm-bio-val" title="Usage Rate">${p.usgPct}%</span></div>` : ''}
        ${p.astPct !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">AST%</span><span class="pm-bio-val" title="Assist Percentage">${p.astPct}%</span></div>` : ''}
        ${p.ortg   !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">ORTG</span><span class="pm-bio-val" title="Offensive Rating">${p.ortg}</span></div>` : ''}
        ${p.drtg   !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">DRTG</span><span class="pm-bio-val" title="Defensive Rating">${p.drtg}</span></div>` : ''}
        ${p.netRtg !== null ? `<div class="pm-bio-row"><span class="pm-bio-key">NET RTG</span><span class="pm-bio-val" title="Net Rating" style="color:${Number(p.netRtg)>0?'#4caf50':'#f44336'}">${Number(p.netRtg)>0?'+':''}${p.netRtg}</span></div>` : ''}
      </div>
    </div>` : ''}
    ${p.badges.length ? `<div class="badges-row">${p.badges.map(b => `<span class="badge">${b}</span>`).join('')}</div>` : ''}
    ${p.statsUpdated ? `<div style="font-size:10px;color:var(--muted);padding:4px 0;text-align:right">Stats updated: ${new Date(p.statsUpdated).toLocaleDateString()}</div>` : ''}`;

  // Strengths
  const strKeys = ['scoring','defense','playmaking','athleticism','shooting','rebounding'];
  document.getElementById('pm-strengths').innerHTML = `
    <div class="strengths-radar">
      ${strKeys.map(k => `
        <div class="strength-row">
          <span class="strength-label">${k.charAt(0).toUpperCase()+k.slice(1)}</span>
          <div class="strength-track"><div class="strength-fill" data-w="${p.strengths[k]}%"></div></div>
          <span class="strength-val">${p.strengths[k]}</span>
        </div>`).join('')}
    </div>`;

  // Game log
  const games = p.recentGames;
  document.getElementById('pm-games').innerHTML = games.length
    ? `<div class="game-log">${games.map(g => `
        <div class="game-row">
          <span class="game-result ${g.result}">${g.result}</span>
          <span class="game-date">${fmtDate(g.date)}</span>
          <span class="game-opp">vs ${g.opponent}</span>
          <span class="game-score">${g.score}</span>
          <div class="game-stats-mini"><span>${g.pts}pts</span><span>${g.reb}reb</span><span>${g.ast}ast</span></div>
        </div>`).join('')}</div>`
    : '<p style="color:var(--muted);padding:16px;font-size:13px">No game log data. Sync more games.</p>';

  // Bio
  document.getElementById('pm-journey').innerHTML = `
    <div class="pm-bio-section">
      <div class="pm-bio-title">PLAYER PROFILE</div>
      <div class="pm-bio-grid">
        <div class="pm-bio-row"><span class="pm-bio-key">Position</span><span class="pm-bio-val">${p.position}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">Jersey</span><span class="pm-bio-val">#${p.jersey}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">Height</span><span class="pm-bio-val">${p.height}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">Weight</span><span class="pm-bio-val">${p.weight}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">Country</span><span class="pm-bio-val">${p.country}</span></div>
        <div class="pm-bio-row"><span class="pm-bio-key">Team</span><span class="pm-bio-val" style="color:${p.teamColor}">${p.team}</span></div>
      </div>
    </div>
    <div class="pm-bio-section" style="margin-top:20px">
      <div class="pm-bio-title">CAREER BIO</div>
      <p style="font-size:13px;color:var(--muted);line-height:1.7;padding:12px;background:var(--bg3);border-radius:var(--radius)">${generatePlayerBio(p)}</p>
    </div>`;

  document.getElementById('playerModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchPlayerTab('overview', document.querySelector('.modal-tab'));

  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.strength-fill[data-w]').forEach(f => { f.style.width = f.dataset.w; });
    }, 150);
  });
}

function generatePlayerBio(p) {
  const posDesc = { PG:'Point Guard', SG:'Shooting Guard', SF:'Small Forward', PF:'Power Forward', C:'Center' };
  const top2 = Object.entries(p.strengths).sort((a,b) => b[1]-a[1]).slice(0,2).map(([k]) => k);
  const country = p.country !== '—' ? ` Hailing from ${p.country},` : '';
  return `${p.name} is a ${posDesc[p.position] || p.position} currently playing for the ${p.team}.${country}
  ${p.ppg > 0 ? ` This season, ${p.name.split(' ')[0]} averages ${p.ppg.toFixed(1)} pts, ${p.rpg.toFixed(1)} reb, and ${p.apg.toFixed(1)} ast per game.` : ''}
  ${top2.length ? ` Known for elite ${top2.join(' and ')}.` : ''}
  ${p.gamesPlayed > 0 ? ` Appeared in ${p.gamesPlayed} games this season.` : ''}`;
}

function switchPlayerTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`pm-${tab}`)?.classList.add('active');
  if (btn) btn.classList.add('active');
  else document.querySelectorAll('.modal-tab').forEach((b, i) => {
    if (['overview','strengths','games','journey'][i] === tab) b.classList.add('active');
  });
  if (tab === 'strengths') {
    setTimeout(() => {
      document.querySelectorAll('.strength-fill[data-w]').forEach(f => { f.style.width = f.dataset.w; });
    }, 100);
  }
}

function closePlayerModal(e) { if (e.target === document.getElementById('playerModalOverlay')) closePlayerModalDirect(); }
function closePlayerModalDirect() {
  document.getElementById('playerModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentPlayerModal = null;
}

/* ── TEAM MODAL ─────────────────────────────────────────────── */
function openTeamModal(abbrev) {
  const t = teams.find(tm => tm.abbrev.toLowerCase() === abbrev.toLowerCase());
  if (!t) return;
  currentTeamModal = abbrev;

  const teamPlayers = players.filter(p => p.teamId === t.id).sort((a,b) => b.ppg - a.ppg);

  document.getElementById('tmBg').style.background = `linear-gradient(135deg, ${t.primaryColor}30, transparent)`;
  document.getElementById('tmLogo').innerHTML = `<img style="width:72px;height:72px;object-fit:contain" src="${t.logoUrl}" alt="${t.name}"
    onerror="this.src='https://a.espncdn.com/i/teamlogos/nba/500/${t.abbrev.toLowerCase()}.png';this.onerror=null">`;
  document.getElementById('tmName').textContent = t.name;
  document.getElementById('tmMeta').textContent = `${t.conference} Conference · ${t.division} · Est. ${t.founded || 'N/A'}`;
  document.getElementById('tmQuick').innerHTML = `
    <div class="mqs-stat"><div class="mqs-val">${t.championships}</div><div class="mqs-lbl">Titles</div></div>
    <div class="mqs-stat"><div class="mqs-val">${t.rosterCount}</div><div class="mqs-lbl">Players</div></div>
    ${t.arena ? `<div class="mqs-stat"><div class="mqs-val" style="font-size:12px">${t.arena}</div><div class="mqs-lbl">Arena</div></div>` : ''}`;

  document.getElementById('tmBody').innerHTML = `
    <div style="padding:24px 32px">
      ${t.history ? `<div class="team-modal-body-section"><div class="team-modal-section-title">TEAM HISTORY</div><p style="font-size:13px;color:var(--muted);line-height:1.7">${t.history}</p></div>` : ''}
      ${t.legends ? `<div class="team-modal-body-section"><div class="team-modal-section-title">LEGENDS</div><p style="font-size:13px;color:var(--muted)">${t.legends}</p></div>` : ''}
      ${t.rivals  ? `<div class="team-modal-body-section"><div class="team-modal-section-title">RIVALRIES</div><p style="font-size:13px;color:var(--muted)">${t.rivals}</p></div>` : ''}
      ${teamPlayers.length ? `
        <div class="team-modal-body-section">
          <div class="team-modal-section-title">CURRENT ROSTER LEADERS</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${teamPlayers.slice(0,5).map(p => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius);cursor:pointer" onclick="closeTeamModalDirect();openPlayerModal(${p.id})">
                <div style="width:32px;height:32px;border-radius:50%;overflow:hidden;background:${t.primaryColor}22;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${t.primaryColor}">
                  ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.textContent='${p.initials}'">` : p.initials}
                </div>
                <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--white)">${p.name}</div><div style="font-size:11px;color:var(--muted)">${p.position}</div></div>
                <div style="font-family:'DM Mono',monospace;font-size:14px;color:var(--gold)">${p.ppg > 0 ? p.ppg.toFixed(1)+' PPG' : '—'}</div>
              </div>`).join('')}
          </div>
        </div>` : '<p style="color:var(--muted);font-size:13px;padding:0 0 16px">No roster data. Sync from NBA API.</p>'}
    </div>`;

  document.getElementById('teamModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTeamModal(e) { if (e.target === document.getElementById('teamModalOverlay')) closeTeamModalDirect(); }
function closeTeamModalDirect() {
  document.getElementById('teamModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentTeamModal = null;
}

/* ── GLOBAL SEARCH ──────────────────────────────────────────── */
function openGlobalSearch() {
  document.getElementById('searchOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 100);
}

function closeGlobalSearchDirect() {
  document.getElementById('searchOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('globalSearchInput').value = '';
  document.getElementById('globalSearchResults').innerHTML = '<div class="search-hint">Start typing to search across players and teams</div>';
}

function closeGlobalSearch(e) { if (e.target === document.getElementById('searchOverlay')) closeGlobalSearchDirect(); }

function runGlobalSearch(val) {
  const q = val.toLowerCase().trim();
  const results = document.getElementById('globalSearchResults');

  if (!q || q.length < 2) {
    results.innerHTML = '<div class="search-hint">Start typing to search across players and teams</div>';
    return;
  }

  const playerResults = players.filter(p =>
    p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q) ||
    p.teamAbbr.toLowerCase().includes(q) || p.position.toLowerCase().includes(q)
  ).slice(0, 6);

  const teamResults = teams.filter(t =>
    t.name.toLowerCase().includes(q) || t.abbrev.toLowerCase().includes(q) ||
    t.division.toLowerCase().includes(q)
  ).slice(0, 4);

  if (!playerResults.length && !teamResults.length) {
    results.innerHTML = '<div class="search-hint">No results found</div>';
    return;
  }

  let html = '';
  if (playerResults.length) {
    html += `<div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:2px;color:var(--muted)">PLAYERS</div>`;
    html += playerResults.map(p => `
      <div class="search-result-item" onclick="closeGlobalSearchDirect();openPlayerModal(${p.id})">
        <div class="sri-avatar" style="background:${p.teamColor}22;color:${p.teamColor}">
          ${p.image ? `<img src="${p.image}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : p.initials}
        </div>
        <div class="sri-info">
          <div class="sri-name">${p.name}</div>
          <div class="sri-meta">${p.team} · ${p.position} · ${p.ppg > 0 ? p.ppg.toFixed(1)+' PPG' : 'No stats'}</div>
        </div>
        <span class="sri-badge">Player</span>
      </div>`).join('');
  }

  if (teamResults.length) {
    html += `<div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:2px;color:var(--muted)">TEAMS</div>`;
    html += teamResults.map(t => `
      <div class="search-result-item" onclick="closeGlobalSearchDirect();scrollToSection('teams');openTeamModal('${t.abbrev}')">
        <div class="sri-avatar" style="background:${t.primaryColor}22">
          <img src="${t.logoUrl}" onerror="this.textContent='${t.abbrev}'" style="width:24px;height:24px;object-fit:contain">
        </div>
        <div class="sri-info">
          <div class="sri-name">${t.name}</div>
          <div class="sri-meta">${t.conference} · ${t.division}</div>
        </div>
        <span class="sri-badge">Team</span>
      </div>`).join('');
  }

  results.innerHTML = html;
}

/* ── TICKER TIME ────────────────────────────────────────────── */
function updateTickerTime() {
  const el = document.getElementById('tickerTime');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

/* ── CAROUSEL ───────────────────────────────────────────────── */
function initCarousel() {
  const track = document.getElementById('carouselTrack');
  const dots  = document.getElementById('carouselDots');
  if (!track) return;

  const slides = track.querySelectorAll('.carousel-slide');
  const total  = slides.length;
  if (!total) return;

  // Build dots
  if (dots) {
    dots.innerHTML = '';
    slides.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = `carousel-dot${i === 0 ? ' active' : ''}`;
      d.onclick = () => goToSlide(i);
      dots.appendChild(d);
    });
  }

  carouselCurrent = 0;
  goToSlide(0);

  // Auto-advance
  setInterval(() => goToSlide((carouselCurrent + 1) % total), 5000);
}

function goToSlide(n) {
  const track  = document.getElementById('carouselTrack');
  const dots   = document.querySelectorAll('.carousel-dot');
  if (!track) return;
  const slides = track.querySelectorAll('.carousel-slide');
  const total  = slides.length;
  carouselCurrent = ((n % total) + total) % total;
  track.style.transform = `translateX(-${carouselCurrent * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === carouselCurrent));
}

function carouselPrev() { goToSlide(carouselCurrent - 1); }
function carouselNext() { goToSlide(carouselCurrent + 1); }

/* ── SIDE WIDGETS — PEEK MODE ───────────────────────────────── */
function toggleSideWidgets() {
  const widgets  = document.getElementById('sideWidgets');
  const showBtn  = document.getElementById('swShowBtn');
  const toggleBtn = document.getElementById('swToggle');
  if (!widgets) return;

  const isCollapsed = widgets.classList.contains('collapsed');

  if (isCollapsed) {
    // Expand
    widgets.classList.remove('collapsed');
    if (showBtn)  showBtn.style.display  = 'none';
    if (toggleBtn) {
      toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
      toggleBtn.title = 'Minimize';
    }
  } else {
    // Collapse to peek
    widgets.classList.add('collapsed');
    if (showBtn)  showBtn.style.display  = 'flex';
    if (toggleBtn) {
      toggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>`;
      toggleBtn.title = 'Expand widgets';
    }
  }
}

/* ── NAV UTILS ──────────────────────────────────────────────── */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Account for fixed schedule bar + navbar so the section header is fully visible
  const scheduleBar = document.getElementById('scheduleBarWrap');
  const navbar = document.getElementById('navbar');
  const scheduleH = scheduleBar ? scheduleBar.offsetHeight : 56;
  const navH = navbar ? navbar.offsetHeight : 88;
  const offset = scheduleH + navH + 8;
  const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function toggleMobileMenu() {
  const m = document.getElementById('mobileMenu');
  const b = document.getElementById('navHam');
  const open = m.classList.toggle('open');
  b.classList.toggle('active', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function initNavScroll() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

function initActiveNav() {
  // All section IDs in DOM order — must match nav link hrefs exactly.
  const SECTION_IDS = ['home','news','players','teams','leaderboards','history','courtmoments'];

  // Pixel offset from viewport top that counts as "past this section".
  // Accounts for fixed schedule bar (~56px) + navbar (~88px) + small buffer.
  const OFFSET = 160;

  // Walk sections top-to-bottom. The last one whose top edge is above
  // OFFSET is the "current" section — works for any section height.
  function getActiveId() {
    let active = SECTION_IDS[0];
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= OFFSET) {
        active = id;
      }
    }
    return active;
  }

  // Highlight the matching nav link (desktop + mobile).
  function syncNav() {
    const id = getActiveId();
    document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id);
    });
  }

  // Throttle via rAF so it never blocks scrolling.
  let rafPending = false;
  window.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { syncNav(); rafPending = false; });
  }, { passive: true });

  // Also re-sync after a click-scroll has had time to settle.
  // We wrap the global scrollToSection so clicking a nav link
  // updates the highlight even if the user doesn't move the mouse.
  const _orig = scrollToSection;
  scrollToSection = function(id) {
    _orig(id);
    setTimeout(syncNav, 700); // wait for smooth scroll to finish
  };

  // Initialise on page load.
  syncNav();
}

/* ── SEARCH WIRING ──────────────────────────────────────────── */
function initSearch() {
  const inp = document.getElementById('searchInput');
  const clr = document.getElementById('searchClear');
  if (!inp) return;
  let timer;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    clr?.classList.toggle('visible', inp.value.length > 0);
    currentPage = 1;
    timer = setTimeout(renderPlayers, 250);
  });
  document.getElementById('teamFilter')?.addEventListener('change',     () => { currentPage = 1; renderPlayers(); });
  document.getElementById('positionFilter')?.addEventListener('change', () => { currentPage = 1; renderPlayers(); });
  document.getElementById('sortSelect')?.addEventListener('change',     () => { currentPage = 1; renderPlayers(); });
}

/* ── TOAST ──────────────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  t.innerHTML = `<span class="toast-icon">${icons[type] || '·'}</span><span>${msg}</span>`;
  c.appendChild(t);
  requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2800);
}

/* ── KEYBOARD ───────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePlayerModalDirect();
    closeTeamModalDirect();
    closeCompareModalDirect();
    closeNewsModalDirect();
    closeGlobalSearchDirect();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openGlobalSearch(); }
});

/* ── SCROLL ANIMATIONS ──────────────────────────────────────── */
function initScrollAnimations() {

  // 1. Bar-fill animations — trigger width transitions for chart bars
  const barObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(
          '.bar-fill[data-width], .lb-bar-fill[data-w], .strength-fill[data-w]'
        ).forEach(el => {
          el.style.width = el.dataset.width || el.dataset.w || '0%';
        });
      }
    });
  }, { threshold: 0.08 });
  ['scoringChart', 'threePtChart', 'lbContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) barObs.observe(el);
  });

  // 2. Fluid reveal system — each selector gets a direction + optional stagger
  //    Threshold is low so animation starts as element peeks in from below.
  //    rootMargin pushes trigger point slightly above the fold bottom.
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const delay = entry.target.dataset.delay ? parseFloat(entry.target.dataset.delay) : 0;
      setTimeout(() => entry.target.classList.add('reveal-visible'), delay);
      revealObs.unobserve(entry.target);
    });
  }, { threshold: 0.04, rootMargin: '0px 0px -20px 0px' });

  // Comprehensive selector map — direction chosen to feel natural per element
  const revealSelectors = [
    // Section structure
    { sel: '.section-eyebrow',        anim: 'fade-up',    stagger: false, base: 0   },
    { sel: '.section-title',          anim: 'fade-up',    stagger: false, base: 40  },
    { sel: '.section-sub',            anim: 'fade-up',    stagger: false, base: 70  },
    // NOTE: hero elements (.hero-title-line, .hero-eyebrow, .hero-sub, .hero-cta-row)
    // are excluded — they have their own CSS keyframe animations on page load
    { sel: '.hss-item',               anim: 'fade-up',    stagger: true,  base: 0   },
    // News
    { sel: '.news-card',              anim: 'fade-up',    stagger: true,  base: 0   },
    // Spotlight
    { sel: '.spotlight-left-content', anim: 'fade-left',  stagger: false, base: 0   },
    { sel: '.spotlight-card',         anim: 'fade-up',    stagger: true,  base: 0   },
    // Players
    { sel: '.player-row',             anim: 'fade-left',  stagger: true,  base: 0   },
    { sel: '.player-card',            anim: 'zoom-up',    stagger: true,  base: 0   },
    // Teams
    { sel: '.team-card',              anim: 'zoom-up',    stagger: true,  base: 0   },
    // Stats & leaderboards
    { sel: '.stat-overview-card',     anim: 'fade-up',    stagger: true,  base: 0   },
    { sel: '.chart-panel',            anim: 'fade-up',    stagger: true,  base: 0   },
    { sel: '.chart-bar-wrap',         anim: 'fade-up',    stagger: true,  base: 0   },
    { sel: '.lb-item',                anim: 'fade-left',  stagger: true,  base: 0   },
    { sel: '.heatmap-panel',          anim: 'fade-up',    stagger: false, base: 0   },
    // History
    { sel: '.tl-node-content',        anim: 'fade-up',    stagger: true,  base: 0   },
    { sel: '.history-item',           anim: 'fade-up',    stagger: true,  base: 0   },
    { sel: '.history-fact-card',      anim: 'zoom-up',    stagger: true,  base: 0   },
    // Carousel
    { sel: '.carousel-section',       anim: 'fade-in',    stagger: false, base: 0   },
    // Widgets
    { sel: '.hero-countdown',         anim: 'fade-right', stagger: false, base: 0   },
    { sel: '.hero-spotlight-card',    anim: 'fade-right', stagger: false, base: 80  },
    { sel: '.filter-bar',             anim: 'fade-down',  stagger: false, base: 0   },
  ];

  revealSelectors.forEach(({ sel, anim, stagger, base }) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (el.classList.contains('reveal-visible') || el.classList.contains('reveal-hidden')) return;
      el.classList.add('reveal-hidden', `reveal-${anim}`);
      // Base delay (positional in section) + stagger offset per item index
      const staggerMs = stagger ? Math.min(i % 7, 6) * 40 : 0;
      el.dataset.delay = String(base + staggerMs);
      revealObs.observe(el);
    });
  });
}

// Re-tag newly injected dynamic elements after async renders complete
function refreshRevealAnimations() {
  const dynamicSelectors = [
    { sel: '.news-card',          anim: 'fade-up',   stagger: true  },
    { sel: '.player-row',         anim: 'fade-left', stagger: true  },
    { sel: '.player-card',        anim: 'zoom-up',   stagger: true  },
    { sel: '.team-card',          anim: 'zoom-up',   stagger: true  },
    { sel: '.spotlight-card',     anim: 'fade-up',   stagger: true  },
    { sel: '.lb-item',            anim: 'fade-left', stagger: true  },
    { sel: '.history-item',       anim: 'fade-up',   stagger: true  },
    { sel: '.history-fact-card',  anim: 'zoom-up',   stagger: true  },
    { sel: '.tl-node-content',    anim: 'fade-up',   stagger: true  },
    { sel: '.stat-overview-card', anim: 'fade-up',   stagger: true  },
    { sel: '.chart-panel',        anim: 'fade-up',   stagger: true  },
  ];

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const delay = entry.target.dataset.delay ? parseFloat(entry.target.dataset.delay) : 0;
      setTimeout(() => entry.target.classList.add('reveal-visible'), delay);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -28px 0px' });

  dynamicSelectors.forEach(({ sel, anim, stagger }) => {
    document.querySelectorAll(sel).forEach((el, i) => {
      if (el.classList.contains('reveal-hidden') || el.classList.contains('reveal-visible')) return;
      el.classList.add('reveal-hidden', `reveal-${anim}`);
      if (stagger) el.dataset.delay = String(Math.min(i % 7, 6) * 70);
      obs.observe(el);
    });
  });
}

/* ── BOOT ───────────────────────────────────────────────────── */
async function init() {
  const loader = document.getElementById('loader');
  window.addEventListener('load', () => {
    setTimeout(() => { loader.classList.add('fade-out'); }, 600);
  });

  initNavScroll();
  initActiveNav();
  initSearch();
  updateTickerTime();
  setInterval(updateTickerTime, 30000);
  renderOTD();
  initNavUser();

  // Render fallback news immediately, then load live
  renderNews();

  // Load core local data first so the page is usable even if external ESPN calls are slow.
  loadTicker().catch(console.warn);   // loads news ticker + triggers schedule bar via ESPN
  await Promise.all([
    loadSummary(),
    loadLeaderboards(),
    loadPlayers(),
    loadTeams(),
  ]);

  // Background loads
  loadCharts().catch(console.warn);
  loadHistory().catch(console.warn);
  loadNews().catch(console.warn);   // live news (may update grid)

  // Load court moments gallery
  loadCourtMoments();

  setTimeout(initScrollAnimations, 1000);
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}