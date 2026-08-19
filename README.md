

https://github.com/user-attachments/assets/26c7d172-37ba-481f-a270-5b617fc045da





# CourtStars

CourtStars is a premium NBA analytics web app built with a static HTML/CSS/JavaScript frontend, PHP API endpoints, a MySQL database, and Python sync scripts for NBA stats data.

The app gives users a basketball dashboard with player spotlights, team pages, leaderboards, charts, NBA news, game ticker data, history content, favorites, comparison tools, and a basketball learning page.

## Features

- Player directory with filters, search, stats, strengths, badges, and recent game logs
- Team directory with conference/division details, logos, roster counts, and season stats
- Leaderboards for points, rebounds, assists, steals, and blocks
- Scoring and three-point charts rendered in the frontend
- ESPN-powered news, scoreboard, schedule, and ticker endpoints
- Player favorites saved in browser `localStorage`
- Player comparison tools
- Authentication API for register, login, logout, and current-user checks
- Learn Basketball page for educational basketball content
- Python scripts for syncing NBA teams, players, season stats, strengths, and game logs

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: PHP with PDO
- Database: MySQL / MariaDB
- Data sync: Python
- External data:
  - `nba_api` for NBA players, teams, stats, and game logs
  - ESPN public endpoints for NBA news and scoreboard data

## Project Structure

```text
courtstars_final/
├── api/
│   ├── auth.php
│   ├── config.php
│   ├── constants.php
│   ├── db.php
│   ├── get_charts.php
│   ├── get_history.php
│   ├── get_leaderboards.php
│   ├── get_news.php
│   ├── get_players.php
│   ├── get_scoreboard.php
│   ├── get_summary.php
│   ├── get_teams.php
│   └── get_ticker.php
├── frontend/
│   ├── index.html
│   ├── main.html
│   ├── learn.html
│   ├── function.js
│   ├── styles.css
│   └── imgs/
├── scripts/
│   ├── sync_nba_stats.py
│   └── sync_game_logs.py
└── README.md
```

## Requirements

- XAMPP, MAMP, WAMP, or another Apache/PHP/MySQL environment
- PHP 8+
- MySQL or MariaDB
- Python 3.10+
- Python packages:

```bash
pip install nba_api mysql-connector-python python-dotenv
```

## Local Setup With XAMPP

1. Place this project inside your XAMPP `htdocs` folder.

```text
/Applications/XAMPP/xamppfiles/htdocs/courtstars_final
```

2. Start Apache and MySQL from the XAMPP control panel.

3. Create a MySQL database.

The default project config uses:

```text
Database: courtstars_schema
User: root
Password: empty string
Host: localhost
```

4. Update database credentials if needed.

Edit `api/config.php`:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'courtstars_schema');
define('DB_USER', 'root');
define('DB_PASS', '');
```

Also update the matching `DB_CONFIG` values in:

```text
scripts/sync_nba_stats.py
scripts/sync_game_logs.py
```

5. Import or create the database schema.

The PHP endpoints expect tables such as:

```text
teams
players
seasons
player_season_stats
team_season_stats
player_strengths
player_badges
player_game_log
history_events
api_cache
users
user_sessions
```

If you have a SQL dump for the project, import it into `courtstars_schema` through phpMyAdmin or the MySQL CLI before running the app.

6. Open the app in your browser.

```text
http://localhost/courtstars_final/frontend/main.html
```

The sign-in page is available at:

```text
http://localhost/courtstars_final/frontend/index.html
```

The learning page is available at:

```text
http://localhost/courtstars_final/frontend/learn.html
```

## Sync NBA Data

Run the main stats sync first:

```bash
python3 scripts/sync_nba_stats.py
```

Optional full sync:

```bash
python3 scripts/sync_nba_stats.py --full
```

Teams and rosters only:

```bash
python3 scripts/sync_nba_stats.py --teams-only
```

Then sync recent game logs:

```bash
python3 scripts/sync_game_logs.py
```

Useful faster sync for development:

```bash
python3 scripts/sync_game_logs.py --top 50 --games 15
```

The first sync can take a while because NBA stats endpoints are rate-limited.

## API Endpoints

Use these endpoints to test the backend:

```text
GET /courtstars_final/api/get_summary.php
GET /courtstars_final/api/get_players.php
GET /courtstars_final/api/get_players.php?search=LeBron
GET /courtstars_final/api/get_players.php?position=PG
GET /courtstars_final/api/get_teams.php
GET /courtstars_final/api/get_leaderboards.php?category=points&limit=10
GET /courtstars_final/api/get_charts.php
GET /courtstars_final/api/get_history.php
GET /courtstars_final/api/get_news.php?limit=6
GET /courtstars_final/api/get_scoreboard.php
GET /courtstars_final/api/get_ticker.php
```

Authentication endpoints:

```text
POST /courtstars_final/api/auth.php?action=register
POST /courtstars_final/api/auth.php?action=login
POST /courtstars_final/api/auth.php?action=logout
GET  /courtstars_final/api/auth.php?action=me
```

Successful endpoints return JSON in this general shape:

```json
{
  "success": true,
  "data": []
}
```

Errors return:

```json
{
  "success": false,
  "error": "Error message"
}
```

## How Data Flows

```text
nba_api
  -> scripts/sync_nba_stats.py
  -> teams, players, seasons, player_season_stats, team_season_stats, strengths

nba_api
  -> scripts/sync_game_logs.py
  -> player_game_log

ESPN public API
  -> PHP news, scoreboard, ticker endpoints
  -> api_cache

PHP API
  -> JSON responses
  -> frontend/function.js
  -> rendered dashboard UI
```

## Scheduling Daily Syncs

On a server, you can schedule updates with cron:

```cron
0 6 * * * /usr/bin/python3 /path/to/courtstars_final/scripts/sync_nba_stats.py >> /tmp/courtstars_stats.log 2>&1
30 6 * * * /usr/bin/python3 /path/to/courtstars_final/scripts/sync_game_logs.py --top 50 >> /tmp/courtstars_games.log 2>&1
```

For XAMPP on macOS, adjust the Python path and project path to match your machine.

## Frontend Notes

- `frontend/main.html` is the main dashboard.
- `frontend/function.js` handles API calls, global state, rendering, filtering, searching, favorites, charts, modals, and UI interactions.
- `frontend/styles.css` contains the main visual design.
- `frontend/index.html` is the sign-in/register page.
- `frontend/learn.html` is the basketball learning page.
- Image assets live in `frontend/imgs/`.

## Troubleshooting

### The page loads but stats are empty

Make sure MySQL is running, `api/config.php` has the right credentials, the database tables exist, and the Python sync scripts have been run.

### API returns a database connection error

Check:

- XAMPP MySQL is started
- `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASS` are correct
- the database exists
- PHP PDO MySQL support is enabled

### Player or team images do not load

Some images are loaded from external NBA or ESPN CDN URLs. Check your internet connection and browser console for blocked requests.

### News or scoreboard data is missing

The news, scoreboard, and ticker endpoints depend on ESPN public API responses. If ESPN is unavailable or rate-limited, those sections may temporarily show fallback UI.

### Python sync fails

Confirm dependencies are installed:

```bash
pip install nba_api mysql-connector-python python-dotenv
```

Also confirm the database credentials inside both Python scripts match your MySQL setup.

## Development Tips

- Keep API responses consistent: `{ "success": true, "data": ... }` for success and `{ "success": false, "error": ... }` for failure.
- After changing table names or columns, update the PHP endpoints and Python sync scripts together.
- Use browser DevTools to inspect failed API requests from `frontend/function.js`.
- Avoid committing real production credentials in `api/config.php` or the Python scripts.

## License

This project is for educational and portfolio use. Add your preferred license before publishing it publicly.
