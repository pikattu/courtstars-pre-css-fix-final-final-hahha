# CourtStars Docker and Kubernetes Deployment

CourtStars is an NBA tracker for news, players, teams, games, charts, leaderboards, and player spotlights. The app is served at `/courtstars/frontend/index.html` and calls APIs under `/courtstars/api`.

## 1. Create The Docker Image

Build the PHP/Apache image:

```bash
docker build -t courtstars:1.0.0 .
```

Run locally with Docker Compose:

```bash
docker compose up --build
```

Open:

```text
http://localhost:8080/courtstars/frontend/index.html
```

Smoke checks:

```bash
curl http://localhost:8080/courtstars/api/test.php
curl http://localhost:8080/courtstars/api/get_summary.php
```

Optional initial sync:

```bash
curl http://localhost:8080/courtstars/api/sync_stats.php
```

## 2. Deploy To Kubernetes

If you use Minikube, first make the image available to the cluster:

```bash
minikube image load courtstars:1.0.0
```

Apply all Kubernetes components:

```bash
kubectl apply -f k8s/
```

This creates:

- Namespace: `courtstars`
- ConfigMap: database host/name and sync TTL
- Secret: database credentials
- PVC: persistent MySQL storage
- MySQL Deployment and ClusterIP Service
- CourtStars app Deployment and NodePort Service
- HPA for app scaling

Wait for pods:

```bash
kubectl get pods -n courtstars -w
```

Open the app:

```bash
kubectl port-forward -n courtstars service/courtstars-app 8080:80
```

Then visit:

```text
http://localhost:8080/courtstars/frontend/index.html
```\

For Minikube NodePort:

```bash
minikube service courtstars-app -n courtstars
```

## 3. Application Feature Walkthrough

- Home: overview, active player/team counts, quick navigation into league sections.
- Newsroom: NBA headlines and story cards.
- Player Spotlight: leaderboard-driven top scoring players.
- Player Index: sortable and filterable player table/grid with stats.
- Team Directory: NBA teams, rosters, colors, arenas, history, and rivalries.
- Stats & Rankings: scoring, rebounds, assists, steals, blocks, charts, and shot profile.
- History and Court Moments: NBA milestones and notable moments.
- Login page: local auth flow backed by the app database.

## 4. Self-Healing

The app and MySQL deployments include liveness probes. Kubernetes restarts failed containers automatically.

Demo:

```bash
kubectl get pods -n courtstars
kubectl delete pod -n courtstars -l app=courtstars-app
kubectl get pods -n courtstars -w
```

Expected result: Kubernetes creates replacement pods and returns the deployment to the desired replica count.

## 5. App Scaling

Manual upscale:

```bash
kubectl scale deployment courtstars-app -n courtstars --replicas=4
kubectl get pods -n courtstars -l app=courtstars-app
```

Manual downscale:

```bash
kubectl scale deployment courtstars-app -n courtstars --replicas=2
kubectl get pods -n courtstars -l app=courtstars-app
```

Autoscaling:

```bash
kubectl get hpa -n courtstars
```

The HPA scales from 2 to 5 replicas when average CPU utilization passes 60 percent. Your cluster needs the Kubernetes metrics server installed for HPA metrics.

## 6. App Version Update

Build a new version:

```bash
docker build -t courtstars:1.1.0 .
minikube image load courtstars:1.1.0
```

Roll out the new image:

```bash
kubectl set image deployment/courtstars-app courtstars=courtstars:1.1.0 -n courtstars
kubectl rollout status deployment/courtstars-app -n courtstars
```

Check rollout history:

```bash
kubectl rollout history deployment/courtstars-app -n courtstars
```

## 7. App Rollback

Rollback to the previous ReplicaSet:

```bash
kubectl rollout undo deployment/courtstars-app -n courtstars
kubectl rollout status deployment/courtstars-app -n courtstars
```

Rollback to a specific revision:

```bash
kubectl rollout history deployment/courtstars-app -n courtstars
kubectl rollout undo deployment/courtstars-app -n courtstars --to-revision=1
```

## 8. Cleanup

```bash
kubectl delete -f k8s/
docker compose down -v
```
