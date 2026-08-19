# APPLICATION CONTAINERIZATION

Project: CourtStars web application  
Updated image version: `courtstars:1.0.1`  
Kubernetes namespace: `courtstars`

## Image Creation

The group created a Docker image so the CourtStars application can run the same way on any machine with Docker. The image packages the PHP backend, Apache web server, Python dependency used by the stats script, database extensions, and the latest frontend files from the `frontend/` folder.

### Figure 1. Dockerfile

```dockerfile
FROM php:8.2-apache

ENV APACHE_DOCUMENT_ROOT=/var/www/html \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    default-mysql-client \
    python3 \
    python3-pip \
    python3-requests \
    python3-numpy \
    curl \
    ca-certificates \
    && docker-php-ext-install pdo_mysql mysqli \
    && pip3 install --no-cache-dir nba_api \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod headers rewrite

COPY docker/apache-courtstars.conf /etc/apache2/conf-available/courtstars.conf
RUN a2enconf courtstars

COPY . /var/www/html/courtstars
RUN chown -R www-data:www-data /var/www/html/courtstars

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost/courtstars/api/test.php || exit 1
```

Purpose:

- `FROM php:8.2-apache` uses an official PHP image with Apache already installed.
- `RUN apt-get update ...` installs MySQL client tools, Python, curl, and required PHP database extensions.
- `pip3 install nba_api` installs the Python package used by the NBA stats script.
- `a2enmod headers rewrite` enables Apache features needed for request handling.
- `COPY docker/apache-courtstars.conf ...` adds the project Apache configuration.
- `COPY . /var/www/html/courtstars` copies the current project files into the image, including the latest `frontend/index.html`, `frontend/styles.css`, `frontend/function.js`, and image assets.
- `HEALTHCHECK` lets Docker/Kubernetes check whether the app is still responding.

### Figure 2. Apache Configuration

```apache
<Directory /var/www/html/courtstars>
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>

ServerName localhost
```

Purpose:

This Apache config allows Apache to serve the CourtStars application folder inside the container.

### Figure 3. Docker Ignore File

```dockerignore
.DS_Store
.git
.gitignore
.vscode
node_modules
vendor
*.log
docker-compose.yml
k8s
docs
```

Purpose:

The `.dockerignore` file keeps development-only files out of the Docker build context. This makes the image build cleaner and avoids copying Kubernetes manifests and documentation into the runtime container.

### Figure 4. Docker Compose App Image Tag

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: courtstars:1.0.1
```

Purpose:

The app service builds from the local `Dockerfile` and tags the result as `courtstars:1.0.1`. The new tag represents the latest frontend version.

### Figure 5. Docker Build Command and Output

Command:

```bash
docker build -t courtstars:1.0.1 .
```

Purpose:

This command builds the Docker image from the current project directory and tags it as `courtstars:1.0.1`.

Terminal output:

```text
#0 building with "desktop-linux" instance using docker driver
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 872B done
#1 DONE 0.0s
#2 [internal] load metadata for docker.io/library/php:8.2-apache
#2 DONE 1.9s
#4 [internal] load .dockerignore
#4 transferring context: 128B done
#4 DONE 0.0s
#11 [6/7] COPY . /var/www/html/courtstars
#11 CACHED
#13 naming to docker.io/library/courtstars:1.0.1 done
#13 unpacking to docker.io/library/courtstars:1.0.1 done
#13 DONE 0.0s
```

Explanation:

Docker read the `Dockerfile`, used `php:8.2-apache` as the base image, copied the application into `/var/www/html/courtstars`, and created the final image named `courtstars:1.0.1`.

### Figure 6. Verify Frontend Files Inside the Image

Command:

```bash
docker run --rm courtstars:1.0.1 sh -lc 'ls -1 /var/www/html/courtstars/frontend'
```

Purpose:

This command starts a temporary container from the image and lists the frontend files inside it.

Terminal output:

```text
function.js
imgs
index.html
learn.html
login.html
styles.css
```

Explanation:

The output proves that the latest frontend files were included inside the new Docker image.

### Figure 7. List Created Docker Images

Command:

```bash
docker images courtstars
```

Purpose:

This command lists available local image versions for the CourtStars application.

Terminal output:

```text
IMAGE              ID             DISK USAGE   CONTENT SIZE   EXTRA
courtstars:1.0.0   039d96c5fcf2       1.11GB          266MB   U
courtstars:1.0.1   a7fb9de39fa7       1.11GB          266MB
```

Explanation:

The output shows both the old image version `1.0.0` and the updated image version `1.0.1`.

## Deployment Creation

The group used Kubernetes to deploy the CourtStars app and MySQL database. Kubernetes was used because it can manage pods, networking, storage, configuration, scaling, self-healing, updates, and rollbacks.

Kubernetes components used:

- `Namespace`
- `ConfigMap`
- `Secret`
- `PersistentVolumeClaim`
- `Deployment`
- `Service`
- `HorizontalPodAutoscaler`
- `Pod`
- `ReplicaSet`

### Figure 8. Namespace Manifest

File: `k8s/00-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: courtstars
```

Purpose:

The namespace separates all CourtStars Kubernetes resources from other resources in the cluster.

### Figure 9. ConfigMap Manifest

File: `k8s/01-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: courtstars-config
  namespace: courtstars
data:
  DB_HOST: courtstars-mysql
  DB_NAME: courtstars_db
  STATS_STALE_HOURS: "6"
```

Purpose:

The ConfigMap stores non-sensitive configuration values, such as database host and database name.

### Figure 10. Secret Manifest

File: `k8s/02-secret.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: courtstars-secret
  namespace: courtstars
type: Opaque
stringData:
  DB_USER: root
  DB_PASS: courtstars_root_password
  MYSQL_ROOT_PASSWORD: courtstars_root_password
```

Purpose:

The Secret stores sensitive values such as database username and password. In a real production project, real passwords should not be committed to source code.

### Figure 11. MySQL PersistentVolumeClaim Manifest

File: `k8s/03-mysql-pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: courtstars-mysql-pvc
  namespace: courtstars
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi
```

Purpose:

The PVC requests persistent storage for MySQL so database files are not lost when the MySQL pod restarts.

### Figure 12. MySQL Deployment Manifest

File: `k8s/04-mysql-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: courtstars-mysql
  namespace: courtstars
  labels:
    app: courtstars-mysql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: courtstars-mysql
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: courtstars-mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.4
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3306
              name: mysql
          env:
            - name: MYSQL_DATABASE
              valueFrom:
                configMapKeyRef:
                  name: courtstars-config
                  key: DB_NAME
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: courtstars-secret
                  key: MYSQL_ROOT_PASSWORD
          volumeMounts:
            - name: mysql-data
              mountPath: /var/lib/mysql
          readinessProbe:
            exec:
              command:
                - sh
                - -c
                - mysqladmin ping -h 127.0.0.1 -p"$MYSQL_ROOT_PASSWORD"
            initialDelaySeconds: 20
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 6
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - mysqladmin ping -h 127.0.0.1 -p"$MYSQL_ROOT_PASSWORD"
            initialDelaySeconds: 60
            periodSeconds: 20
            timeoutSeconds: 5
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 768Mi
      volumes:
        - name: mysql-data
          persistentVolumeClaim:
            claimName: courtstars-mysql-pvc
```

Purpose:

This Deployment runs one MySQL pod, injects configuration from the ConfigMap and Secret, mounts persistent storage, and uses probes so Kubernetes can check database health.

### Figure 13. MySQL Service Manifest

File: `k8s/05-mysql-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: courtstars-mysql
  namespace: courtstars
spec:
  type: ClusterIP
  selector:
    app: courtstars-mysql
  ports:
    - name: mysql
      port: 3306
      targetPort: 3306
```

Purpose:

The MySQL Service gives the database a stable internal hostname, `courtstars-mysql`, which the PHP app uses as `DB_HOST`.

### Figure 14. App Deployment Manifest

File: `k8s/06-app-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: courtstars-app
  namespace: courtstars
  labels:
    app: courtstars-app
spec:
  replicas: 2
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: courtstars-app
  template:
    metadata:
      labels:
        app: courtstars-app
        version: "1.0.1"
    spec:
      containers:
        - name: courtstars
          image: courtstars:1.0.1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
              name: http
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: courtstars-config
                  key: DB_HOST
            - name: DB_NAME
              valueFrom:
                configMapKeyRef:
                  name: courtstars-config
                  key: DB_NAME
            - name: STATS_STALE_HOURS
              valueFrom:
                configMapKeyRef:
                  name: courtstars-config
                  key: STATS_STALE_HOURS
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: courtstars-secret
                  key: DB_USER
            - name: DB_PASS
              valueFrom:
                secretKeyRef:
                  name: courtstars-secret
                  key: DB_PASS
          readinessProbe:
            httpGet:
              path: /courtstars/api/test.php
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /courtstars/api/test.php
              port: 80
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 750m
              memory: 768Mi
```

Purpose:

This Deployment runs two app pods using the updated image `courtstars:1.0.1`. The rolling update strategy allows Kubernetes to replace old pods with new pods without downtime.

### Figure 15. App Service Manifest

File: `k8s/07-app-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: courtstars-app
  namespace: courtstars
spec:
  type: NodePort
  selector:
    app: courtstars-app
  ports:
    - name: http
      port: 80
      targetPort: 80
      nodePort: 30080
```

Purpose:

This Service exposes the app pods on port `80` inside the cluster and on NodePort `30080` from the Kubernetes node.

### Figure 16. HorizontalPodAutoscaler Manifest

File: `k8s/08-hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: courtstars-app-hpa
  namespace: courtstars
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: courtstars-app
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

Purpose:

The HPA is configured to keep at least 2 pods and scale up to 5 pods when average CPU utilization reaches 60%. On the tested local cluster, CPU metrics displayed as `<unknown>`, which means metrics-server was not reporting metrics.

### Figure 17. Apply Kubernetes Manifests

Command:

```bash
kubectl apply -f k8s
```

Purpose:

This command creates or updates all Kubernetes resources in the `k8s/` folder.

Terminal output:

```text
namespace/courtstars unchanged
configmap/courtstars-config unchanged
secret/courtstars-secret configured
persistentvolumeclaim/courtstars-mysql-pvc unchanged
deployment.apps/courtstars-mysql unchanged
service/courtstars-mysql unchanged
deployment.apps/courtstars-app configured
service/courtstars-app unchanged
horizontalpodautoscaler.autoscaling/courtstars-app-hpa unchanged
```

Explanation:

Kubernetes updated the app deployment because its image changed to `courtstars:1.0.1`. Other resources already existed, so they were unchanged.

### Figure 18. Check Rollout Status

Command:

```bash
kubectl rollout status deployment/courtstars-app -n courtstars --timeout=120s
```

Purpose:

This command waits until the new app version finishes rolling out.

Terminal output:

```text
Waiting for deployment "courtstars-app" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "courtstars-app" rollout to finish: 1 old replicas are pending termination...
deployment "courtstars-app" successfully rolled out
```

Explanation:

Kubernetes gradually replaced the old pods with new pods using the updated image.

### Figure 19. Check Kubernetes Resources

Command:

```bash
kubectl get deployments,pods,svc,hpa -n courtstars -o wide
```

Purpose:

This command displays the running deployments, pods, services, and HPA.

Terminal output:

```text
NAME                               READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES             SELECTOR
deployment.apps/courtstars-app     2/2     2            2           37h   courtstars   courtstars:1.0.1   app=courtstars-app
deployment.apps/courtstars-mysql   1/1     1            1           37h   mysql        mysql:8.4          app=courtstars-mysql

NAME                                   READY   STATUS    RESTARTS        AGE   IP            NODE             NOMINATED NODE   READINESS GATES
pod/courtstars-app-558d8d4b58-8prwh    1/1     Running   0               19s   10.244.1.13   desktop-worker   <none>           <none>
pod/courtstars-app-558d8d4b58-pcmqd    1/1     Running   0               31s   10.244.1.12   desktop-worker   <none>           <none>
pod/courtstars-mysql-6795dfcf8-j99wz   1/1     Running   3 (3h42m ago)   37h   10.244.1.4    desktop-worker   <none>           <none>

NAME                       TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)        AGE   SELECTOR
service/courtstars-app     NodePort    10.96.1.208   <none>        80:30080/TCP   37h   app=courtstars-app
service/courtstars-mysql   ClusterIP   10.96.71.86   <none>        3306/TCP       37h   app=courtstars-mysql

NAME                                                     REFERENCE                   TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
horizontalpodautoscaler.autoscaling/courtstars-app-hpa   Deployment/courtstars-app   cpu: <unknown>/60%   2         5         2          37h
```

Explanation:

The app deployment has 2 available replicas running image `courtstars:1.0.1`. MySQL is also running. The app is exposed by the NodePort service.

## Kubernetes Components Exploration

### Execution of the Application

Command:

```bash
kubectl port-forward service/courtstars-app 8088:80 -n courtstars
```

Purpose:

This command forwards local port `8088` to the Kubernetes app service port `80`, making the app accessible from a local browser.

Terminal output:

```text
Forwarding from 127.0.0.1:8088 -> 80
Forwarding from [::1]:8088 -> 80
```

Browser URL:

```text
http://localhost:8088/courtstars/frontend/index.html
```

Verification command:

```bash
curl -I --max-time 10 http://127.0.0.1:8088/courtstars/frontend/index.html
```

Terminal output:

```text
HTTP/1.1 200 OK
Date: Thu, 28 May 2026 02:50:47 GMT
Server: Apache/2.4.67 (Debian)
Content-Length: 47127
Content-Type: text/html
```

Explanation:

The `200 OK` response proves that the CourtStars frontend is being served successfully from Kubernetes.

Screenshot to include:

Open `http://localhost:8088/courtstars/frontend/index.html` in a browser and capture the CourtStars homepage. Explain that the browser is displaying the frontend files served from the Kubernetes app service through port forwarding.

### Self-Healing Feature

Command:

```bash
kubectl delete pod courtstars-app-558d8d4b58-htl5r -n courtstars
```

Purpose:

This command manually deletes one app pod to test whether Kubernetes replaces it.

Terminal output:

```text
pod "courtstars-app-558d8d4b58-htl5r" deleted from courtstars namespace
```

Check pods after deletion:

```bash
kubectl get pods -n courtstars -l app=courtstars-app -o wide
```

Terminal output:

```text
NAME                              READY   STATUS    RESTARTS   AGE   IP           NODE
courtstars-app-558d8d4b58-6nmxb   0/1     Running   0          9s    10.244.1.7   desktop-worker
courtstars-app-558d8d4b58-tght8   1/1     Running   0          91s   10.244.1.5   desktop-worker
```

Wait for recovery:

```bash
kubectl wait --for=condition=ready pod -l app=courtstars-app -n courtstars --timeout=120s
```

Terminal output:

```text
pod/courtstars-app-558d8d4b58-6nmxb condition met
pod/courtstars-app-558d8d4b58-tght8 condition met
```

Final check:

```bash
kubectl get pods -n courtstars -l app=courtstars-app -o wide
```

Terminal output:

```text
NAME                              READY   STATUS    RESTARTS   AGE   IP           NODE
courtstars-app-558d8d4b58-6nmxb   1/1     Running   0          15s   10.244.1.7   desktop-worker
courtstars-app-558d8d4b58-tght8   1/1     Running   0          97s   10.244.1.5   desktop-worker
```

Explanation:

Kubernetes noticed that one pod was deleted and automatically created a replacement pod. This is important because it helps keep the application available even when a container crashes or a pod is accidentally removed.

Screenshot to include:

Capture the terminal before and after the pod deletion. Highlight the new pod name and show that both pods return to `1/1 Running`.

### Application Scaling

Scale up command:

```bash
kubectl scale deployment courtstars-app --replicas=4 -n courtstars
```

Purpose:

This command increases the number of app pods from 2 to 4.

Terminal output:

```text
deployment.apps/courtstars-app scaled
```

Check scaled deployment:

```bash
kubectl get deployment courtstars-app -n courtstars
```

Terminal output:

```text
NAME             READY   UP-TO-DATE   AVAILABLE   AGE
courtstars-app   4/4     4            4           37h
```

Check scaled pods:

```bash
kubectl get pods -n courtstars -l app=courtstars-app -o wide
```

Terminal output:

```text
NAME                              READY   STATUS    RESTARTS   AGE    IP           NODE
courtstars-app-558d8d4b58-6nmxb   1/1     Running   0          37s    10.244.1.7   desktop-worker
courtstars-app-558d8d4b58-7smx5   1/1     Running   0          18s    10.244.1.8   desktop-worker
courtstars-app-558d8d4b58-8w6z9   1/1     Running   0          18s    10.244.1.9   desktop-worker
courtstars-app-558d8d4b58-tght8   1/1     Running   0          119s   10.244.1.5   desktop-worker
```

Scale down command:

```bash
kubectl scale deployment courtstars-app --replicas=2 -n courtstars
```

Terminal output:

```text
deployment.apps/courtstars-app scaled
```

Final check:

```bash
kubectl get deployment courtstars-app -n courtstars
```

Terminal output:

```text
NAME             READY   UP-TO-DATE   AVAILABLE   AGE
courtstars-app   2/2     2            2           37h
```

Explanation:

Scaling up adds more app pods so the application can handle more users. Scaling down saves resources when traffic becomes normal again.

Sample scenario:

CourtStars should be scaled up during high traffic, such as when many users check NBA statistics after a major game. It can be scaled down at night or during low activity to reduce CPU and memory usage.

Screenshot to include:

Capture terminal output showing `4/4` pods after scaling up, then `2/2` after scaling down.

### Application Version Update

The app was updated from image `courtstars:1.0.0` to `courtstars:1.0.1`.

Manifest update:

```yaml
metadata:
  labels:
    app: courtstars-app
    version: "1.0.1"
spec:
  containers:
    - name: courtstars
      image: courtstars:1.0.1
```

Apply command:

```bash
kubectl apply -f k8s/06-app-deployment.yaml
```

Terminal output:

```text
deployment.apps/courtstars-app configured
```

Check deployed image:

```bash
kubectl get deployment courtstars-app -n courtstars -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Terminal output:

```text
courtstars:1.0.1
```

Explanation:

Kubernetes makes updates easier because developers only need to build a new image, update the image tag, and apply the deployment. Kubernetes performs the rolling update by creating new pods and removing old pods after the new ones are ready.

Screenshot to include:

Capture the deployment output showing image `courtstars:1.0.1` and the rollout status showing success.

### Application Rollback

Rollback command:

```bash
kubectl rollout undo deployment/courtstars-app -n courtstars
```

Purpose:

This command tells Kubernetes to go back to the previous deployment revision.

Terminal output:

```text
deployment.apps/courtstars-app rolled back
```

Check rollback status:

```bash
kubectl rollout status deployment/courtstars-app -n courtstars --timeout=120s
```

Terminal output:

```text
Waiting for deployment "courtstars-app" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "courtstars-app" rollout to finish: 1 old replicas are pending termination...
deployment "courtstars-app" successfully rolled out
```

Check image after rollback:

```bash
kubectl get deployment courtstars-app -n courtstars -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Terminal output:

```text
courtstars:1.0.0
```

Restore latest version:

```bash
kubectl apply -f k8s/06-app-deployment.yaml
kubectl rollout status deployment/courtstars-app -n courtstars --timeout=120s
```

Terminal output:

```text
deployment.apps/courtstars-app configured
deployment "courtstars-app" successfully rolled out
```

Final image check:

```bash
kubectl get deployment courtstars-app -n courtstars -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Terminal output:

```text
courtstars:1.0.1
```

Explanation:

Rollback is easy in Kubernetes because Deployment revisions are stored automatically. If a new image has a bug, developers can use `kubectl rollout undo` to return to the previous version. After testing rollback, the app was restored to the latest version `courtstars:1.0.1`.

Screenshot to include:

Capture terminal output showing rollback to `courtstars:1.0.0`, then restoration to `courtstars:1.0.1`.

