#!/usr/bin/env python3
"""
FILE: scripts/fetch_nba_api.py
Compatible with nba_api 1.11.x
  per_mode_detailed  (not per_mode_simple or per_mode)
  measure_type_detailed_defense  (unchanged)
"""

import json, sys, os, time, argparse, re
sys.stderr = open(os.devnull, 'w')

try:
    from nba_api.stats.endpoints import leaguedashplayerstats
except ImportError:
    sys.stdout.write(json.dumps({"error": "nba_api not installed. Run: pip install nba_api"}))
    sys.exit(1)

try:
    from nba_api.stats.endpoints import leaguedashplayerbiostats
    HAS_BIOSTATS = True
except ImportError:
    HAS_BIOSTATS = False

def current_season():
    from datetime import date
    today = date.today()
    y = today.year if today.month >= 10 else today.year - 1
    return f"{y}-{str(y+1)[-2:]}"

def safe_float(v, dec=2):
    try: return round(float(v), dec)
    except: return 0.0

def safe_int(v):
    try: return int(float(v))
    except: return 0

def height_to_inches(h):
    if not h: return None
    m = re.search(r'(\d+)[\-\']\s*(\d+)', str(h))
    if m: return int(m.group(1)) * 12 + int(m.group(2))
    m = re.search(r'(\d+)', str(h))
    return int(m.group(1)) if m else None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', default=current_season())
    args = parser.parse_args()
    season = args.season

    # ── 1. Per-game stats ─────────────────────────────────────
    try:
        per_game = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            season_type_all_star='Regular Season',
            measure_type_detailed_defense='Base',
            per_mode_detailed='PerGame',
            timeout=60,
        ).get_normalized_dict()['LeagueDashPlayerStats']
        time.sleep(0.6)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"PerGame fetch failed: {e}"}))
        sys.exit(1)

    # ── 2. Advanced stats ─────────────────────────────────────
    adv_map = {}
    try:
        advanced = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            season_type_all_star='Regular Season',
            measure_type_detailed_defense='Advanced',
            per_mode_detailed='PerGame',
            timeout=60,
        ).get_normalized_dict()['LeagueDashPlayerStats']
        time.sleep(0.6)
        adv_map = {r['PLAYER_ID']: r for r in advanced}
    except Exception:
        pass

    # ── 3. Bio stats (optional — height/weight/country) ───────
    bio_map = {}
    if HAS_BIOSTATS:
        try:
            bio_rows = leaguedashplayerbiostats.LeagueDashPlayerBioStats(
                season=season,
                per_mode_detailed='PerGame',
                timeout=60,
            ).get_normalized_dict()['LeagueDashPlayerBioStats']
            time.sleep(0.6)
            bio_map = {r['PLAYER_ID']: r for r in bio_rows}
        except Exception:
            pass

    # ── merge & emit ──────────────────────────────────────────
    output = []
    for r in per_game:
        pid = r['PLAYER_ID']
        adv = adv_map.get(pid, {})
        b   = bio_map.get(pid, {})

        full_name = r.get('PLAYER_NAME', '')
        parts = full_name.strip().split(' ', 1)
        first = parts[0] if parts else ''
        last  = parts[1] if len(parts) > 1 else ''

        height_in  = height_to_inches(str(b.get('PLAYER_HEIGHT', '')))
        weight_raw = b.get('PLAYER_WEIGHT', '')
        try:   weight = int(float(weight_raw)) if weight_raw else None
        except: weight = None

        output.append({
            'nba_id':           pid,
            'first_name':       first,
            'last_name':        last,
            'position':         r.get('PLAYER_POSITION', b.get('POSITION', '')),
            'team_abbreviation': r.get('TEAM_ABBREVIATION', ''),
            'age':              safe_float(b.get('AGE', 0), 1),
            'height_inches':    height_in,
            'weight_lbs':       weight,
            'country':          b.get('COUNTRY', ''),
            'draft_year':       safe_int(b.get('DRAFT_YEAR', 0)),
            'draft_round':      safe_int(b.get('DRAFT_ROUND', 0)),
            'draft_number':     safe_int(b.get('DRAFT_NUMBER', 0)),
            'avatar_url':       f"https://cdn.nba.com/headshots/nba/latest/1040x760/{pid}.png",
            'games_played':     safe_int(r.get('GP', 0)),
            'games_started':    safe_int(r.get('GS', 0)),
            'minutes_per_game': safe_float(r.get('MIN', 0)),
            'points_per_game':  safe_float(r.get('PTS', 0)),
            'rebounds_per_game': safe_float(r.get('REB', 0)),
            'offensive_rebounds': safe_float(r.get('OREB', 0)),
            'defensive_rebounds': safe_float(r.get('DREB', 0)),
            'assists_per_game': safe_float(r.get('AST', 0)),
            'steals_per_game':  safe_float(r.get('STL', 0)),
            'blocks_per_game':  safe_float(r.get('BLK', 0)),
            'turnovers_per_game': safe_float(r.get('TOV', 0)),
            'field_goal_pct':   safe_float(r.get('FG_PCT', 0), 3),
            'three_pt_pct':     safe_float(r.get('FG3_PCT', 0), 3),
            'free_throw_pct':   safe_float(r.get('FT_PCT', 0), 3),
            'three_point_attempts': safe_float(r.get('FG3A', 0)),
            'three_point_made': safe_float(r.get('FG3M', 0)),
            'player_efficiency_rating': safe_float(adv.get('PIE', 0), 3),
            'true_shooting_pct': safe_float(adv.get('TS_PCT', 0), 3),
            'assist_pct':       safe_float(adv.get('AST_PCT', 0), 3),
            'usage_rate':       safe_float(adv.get('USG_PCT', 0), 3),
            'offensive_rating': safe_float(adv.get('OFF_RATING', 0)),
            'defensive_rating': safe_float(adv.get('DEF_RATING', 0)),
            'net_rating':       safe_float(adv.get('NET_RATING', 0)),
            'pace':             safe_float(adv.get('PACE', 0)),
        })

    sys.stdout.write(json.dumps(output))
    sys.stdout.flush()

if __name__ == '__main__':
    main()