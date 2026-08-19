

https://github.com/user-attachments/assets/26c7d172-37ba-481f-a270-5b617fc045da





# CourtStars

CourtStars is an NBA web app for viewing players, teams, stats, leaderboards, game information, news, and basketball history. The project uses a PHP API, a MySQL database, and a static frontend served through Apache.

## Project Structure

```text
courtstars/
├── api/                 PHP API endpoints
├── config/              Database and app constants
├── database/            SQL migration files
├── docker/              Apache configuration
├── docs/                Deployment and project documentation
├── frontend/            HTML, CSS, JavaScript, and image assets
├── k8s/                 Kubernetes deployment files
├── scripts/             Python scripts for NBA stat syncing
├── Dockerfile           PHP/Apache container image
└── docker-compose.yml   Local app + MySQL setup
```

## Requirements

For the recommended Docker setup:

- Docker Desktop
- Docker Compose

For local XAMPP/manual setup:

- XAMPP with Apache and MySQL
- PHP 8+
- Python 3
- Python packages: `requests`, `numpy`, and `nba_api`

## Quick Start With Docker

From the project root, run:

```bash
docker compose up --build
```

Wait for the app and database containers to start, then open:

```text
http://localhost:8080/courtstars/frontend/index.html
```

Useful pages:

```text
Home:  http://localhost:8080/courtstars/frontend/index.html
Login: http://localhost:8080/courtstars/frontend/login.html
Learn: http://localhost:8080/courtstars/frontend/learn.html
```

Useful API checks:

```bash
curl http://localhost:8080/courtstars/api/test.php
curl http://localhost:8080/courtstars/api/get_summary.php
```

The MySQL database runs inside Docker on port `3307` on your machine. The app container connects to it using the settings in `docker-compose.yml`.

## Loading NBA Data

CourtStars can sync NBA teams, rosters, player stats, leaderboards, and games from public ESPN endpoints and the Python `nba_api` package.

To manually trigger a sync after Docker is running, open:

```text
http://localhost:8080/courtstars/api/sync_stats.php
```

Or run:

```bash
curl http://localhost:8080/courtstars/api/sync_stats.php
```

The app also tries to auto-sync when player data is missing or stale.

## Run With XAMPP

1. Place this project folder inside your XAMPP `htdocs` directory.

   Example on macOS:

   ```text
   /Applications/XAMPP/xamppfiles/htdocs/courtstars
   ```

2. Start Apache and MySQL from the XAMPP control panel.

3. Create a MySQL database named:

   ```text
   courtstars_db
   ```

4. Confirm the local database settings in `config/constants.php`.

   Default local values are:

   ```text
   DB_HOST = 127.0.0.1
   DB_NAME = courtstars_db
   DB_USER = root
   DB_PASS = empty password
   ```

5. Install the Python dependency used for live NBA stats:

   ```bash
   pip install nba_api requests numpy
   ```

6. Open the app:

   ```text
   http://localhost/courtstars/frontend/index.html
   ```

7. Optional: run the data sync:

   ```text
   http://localhost/courtstars/api/sync_stats.php
   ```

## Database Notes

The PHP database connection automatically creates the main tables when the app connects. If you need to apply the v2 migration manually, use:

```bash
mysql -u root courtstars_db < database/migrate_v2.sql
```

Warning: `database/migrate_v2.sql` clears existing `player_stats` and `leaderboards` rows so fresh live data can be loaded.

## Docker Commands

Start or rebuild the app:

```bash
docker compose up --build
```

Run in the background:

```bash
docker compose up -d --build
```

Stop containers:

```bash
docker compose down
```

Stop containers and delete the local MySQL volume:

```bash
docker compose down -v
```

## Kubernetes

Kubernetes manifests are included in `k8s/`. For a local Minikube-style deployment:

```bash
docker build -t courtstars:1.0.1 .
minikube image load courtstars:1.0.1
kubectl apply -f k8s/
kubectl get pods -n courtstars
```

Open with port-forwarding:

```bash
kubectl port-forward -n courtstars service/courtstars-app 8080:80
```

Then visit:

```text
http://localhost:8080/courtstars/frontend/index.html
```

More deployment details are available in `docs/deployment-walkthrough.md`.

## Troubleshooting

If the page loads but data is missing:

- Make sure MySQL is running.
- Open `/courtstars/api/test.php` to confirm PHP is working.
- Open `/courtstars/api/sync_stats.php` to trigger a fresh data sync.
- Check that Python and `nba_api` are installed if running without Docker.

If Docker cannot use port `8080`, edit the app port in `docker-compose.yml`:

```yaml
ports:
  - "8081:80"
```

Then open:

```text
http://localhost:8081/courtstars/frontend/index.html
```

## Main Technologies

- PHP 8.2
- Apache
- MySQL 8.4
- JavaScript, HTML, and CSS
- Python `nba_api`
- Docker and Docker Compose
- Kubernetes manifests for container deployment

## License

This project is for educational and portfolio use. Add your preferred license before publishing it publicly.
