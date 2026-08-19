# CourtStars Deployment Walkthrough Continued

This continuation file starts from the Kubernetes Components Exploration section of `docs/deployment-walkthrough.md`. It exists only to make the long report easier to open and copy from.

## Kubernetes Components Exploration

### Execution of the Application

The deployment was run on Docker Desktop Kubernetes. The context was checked with:

```bash
kubectl config get-contexts
kubectl get nodes
```

Terminal output:

```text
CURRENT   NAME             CLUSTER          AUTHINFO         NAMESPACE
*         docker-desktop   docker-desktop   docker-desktop

NAME                    STATUS   ROLES           AGE     VERSION
desktop-control-plane   Ready    control-plane   2m43s   v1.34.0
desktop-worker          Ready    <none>          2m29s   v1.34.0
```

This output proves that `kubectl` is connected to Docker Desktop Kubernetes and that the cluster nodes are ready.

The application was opened through port forwarding:

```bash
kubectl port-forward -n courtstars service/courtstars-app 8088:80
```

Terminal output:

```text
Forwarding from 127.0.0.1:8088 -> 80
Forwarding from [::1]:8088 -> 80
```

Open the application in the browser:

```text
http://127.0.0.1:8088/courtstars/frontend/index.html
```

Screenshot description: The browser shows the CourtStars homepage. The frontend loads NBA sections such as players, teams, charts, leaderboards, and news. This proves that the Kubernetes Service is forwarding traffic to the CourtStars app pods and that Apache is serving the frontend correctly.

The API was also tested through the same port-forward:

```bash
curl -i http://127.0.0.1:8088/courtstars/api/test.php
curl -I http://127.0.0.1:8088/courtstars/frontend/index.html
curl -s http://127.0.0.1:8088/courtstars/api/get_summary.php
```

Terminal output:

```text
HTTP/1.1 200 OK
Date: Tue, 26 May 2026 13:33:40 GMT
Server: Apache/2.4.67 (Debian)
X-Powered-By: PHP/8.2.31
Content-Length: 9
Content-Type: text/html; charset=UTF-8

PHP WORKS

HTTP/1.1 200 OK
Date: Tue, 26 May 2026 13:33:36 GMT
Server: Apache/2.4.67 (Debian)
Content-Length: 45988
Content-Type: text/html

{"success":true,"data":{"players":0,"seasons":1,"teams":0,"championships":0}}
```

This output proves that the PHP health endpoint, frontend HTML file, and summary API are all reachable through the Kubernetes Service.

### Self-Healing Feature

Kubernetes self-healing means the cluster automatically replaces failed pods so the desired state is maintained. This is important because if a container crashes or a node deletes a pod, the application can recover without manual container recreation.

The CourtStars app uses two replicas:

```yaml
spec:
  replicas: 2
```

It also uses a liveness probe:

```yaml
livenessProbe:
  httpGet:
    path: /courtstars/api/test.php
    port: 80
  initialDelaySeconds: 30
  periodSeconds: 20
  timeoutSeconds: 3
  failureThreshold: 3
```

The liveness probe checks whether the PHP application is still healthy. If the endpoint fails repeatedly, Kubernetes restarts the container.

Self-healing demo commands:

```bash
kubectl delete pod -n courtstars -l app=courtstars-app
kubectl get pods -n courtstars -l app=courtstars-app -o wide
```

Terminal output:

```text
pod "courtstars-app-7d95554db5-dqcs4" deleted from courtstars namespace
pod "courtstars-app-7d95554db5-gbkfz" deleted from courtstars namespace

NAME                              READY   STATUS    RESTARTS   AGE   IP           NODE             NOMINATED NODE   READINESS GATES
courtstars-app-7d95554db5-h2jkl   1/1     Running   0          17s   10.244.1.6   desktop-worker   <none>           <none>
courtstars-app-7d95554db5-ls964   1/1     Running   0          16s   10.244.1.7   desktop-worker   <none>           <none>
```

Screenshot description: The first terminal view shows two running CourtStars app pods. After deleting the app pods, Kubernetes immediately creates replacement pods. The final terminal view shows the replacement pods in `Running` status. This proves that Kubernetes restored the desired replica count.

### Application Scaling

CourtStars supports both manual scaling and automatic scaling.

Manual scale up command:

```bash
kubectl scale deployment courtstars-app -n courtstars --replicas=4
kubectl get pods -n courtstars -l app=courtstars-app
```

Terminal output:

```text
deployment.apps/courtstars-app scaled

NAME                              READY   STATUS    RESTARTS   AGE
courtstars-app-7d95554db5-6hzgl   1/1     Running   0          63s
courtstars-app-7d95554db5-h2jkl   1/1     Running   0          2m17s
courtstars-app-7d95554db5-ls964   1/1     Running   0          2m16s
courtstars-app-7d95554db5-rcxqq   1/1     Running   0          63s
```

Manual scale down command:

```bash
kubectl scale deployment courtstars-app -n courtstars --replicas=2
kubectl get pods -n courtstars -l app=courtstars-app
```

Terminal output:

```text
deployment.apps/courtstars-app scaled

NAME                              READY   STATUS    RESTARTS   AGE
courtstars-app-7d95554db5-h2jkl   1/1     Running   0          2m37s
courtstars-app-7d95554db5-ls964   1/1     Running   0          2m36s
```

Autoscaling check:

```bash
kubectl get hpa -n courtstars
```

Terminal output:

```text
NAME                 REFERENCE                   TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
courtstars-app-hpa   Deployment/courtstars-app   cpu: <unknown>/60%   2         5         2          4m32s
```

Screenshot description: The scaling terminal output shows that the number of CourtStars app pods increased from 2 to 4, then returned to 2. The HPA output shows the configured minimum and maximum pod counts. The CPU target was unknown during this Docker Desktop run because metrics-server data was not available.

Sample scale-up scenario: During an NBA game night, more users may open CourtStars to check player statistics, leaderboards, and news. The app should scale up when CPU usage increases.

Sample scale-down scenario: During off-peak hours, traffic is lower. The app should scale back down to fewer replicas to save CPU and memory resources.

### Application Version Update

Kubernetes makes version updates easier because the Deployment manages rolling updates automatically. CourtStars uses this rolling update strategy:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

This means Kubernetes can create one extra new pod during an update and keeps all old pods available until the new pod is ready.

Build a new image:

```bash
docker build -t courtstars:1.1.0 .
```

Terminal output:

```text
#13 exporting to image
#13 naming to docker.io/library/courtstars:1.1.0 done
#13 DONE 0.0s
```

Because Docker Desktop Kubernetes uses the Docker Desktop image store, the locally built `courtstars:1.1.0` image was available to the cluster without a `minikube image load` command.

Update the Deployment image:

```bash
kubectl set image deployment/courtstars-app courtstars=courtstars:1.1.0 -n courtstars
kubectl rollout status deployment/courtstars-app -n courtstars
```

Terminal output:

```text
deployment.apps/courtstars-app image updated
Waiting for deployment "courtstars-app" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "courtstars-app" rollout to finish: 1 old replicas are pending termination...
deployment "courtstars-app" successfully rolled out
```

Image check after update:

```bash
kubectl get deployment courtstars-app -n courtstars -o wide
```

Terminal output:

```text
NAME             READY   UP-TO-DATE   AVAILABLE   AGE     CONTAINERS   IMAGES             SELECTOR
courtstars-app   2/2     2            2           5m14s   courtstars   courtstars:1.1.0   app=courtstars-app
```

Check rollout history:

```bash
kubectl rollout history deployment/courtstars-app -n courtstars
```

Terminal output:

```text
deployment.apps/courtstars-app
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

Screenshot description: The rollout terminal output shows Kubernetes replacing old pods with new pods and completing the update successfully. This makes updates easier for developers because they only need to build the new image and update the Deployment image tag.

### Application Rollback

Kubernetes also supports rollback when a new version has problems. CourtStars keeps deployment history using:

```yaml
revisionHistoryLimit: 5
```

Rollback to the previous version:

```bash
kubectl rollout undo deployment/courtstars-app -n courtstars
kubectl rollout status deployment/courtstars-app -n courtstars
```

Terminal output:

```text
deployment.apps/courtstars-app rolled back
Waiting for deployment "courtstars-app" rollout to finish: 1 out of 2 new replicas have been updated...
Waiting for deployment "courtstars-app" rollout to finish: 1 old replicas are pending termination...
deployment "courtstars-app" successfully rolled out
```

Image check after rollback:

```bash
kubectl get deployment courtstars-app -n courtstars -o wide
```

Terminal output:

```text
NAME             READY   UP-TO-DATE   AVAILABLE   AGE     CONTAINERS   IMAGES             SELECTOR
courtstars-app   2/2     2            2           5m49s   courtstars   courtstars:1.0.0   app=courtstars-app
```

The app was retested after rollback:

```bash
kubectl port-forward -n courtstars service/courtstars-app 8088:80
curl -s http://127.0.0.1:8088/courtstars/api/test.php
```

Terminal output:

```text
Forwarding from 127.0.0.1:8088 -> 80
Forwarding from [::1]:8088 -> 80
PHP WORKS
```

Screenshot description: The terminal shows the rollout history, rollback command, and final image check. After rollback, Kubernetes restored the previous image version `courtstars:1.0.0`. This is useful when a new image version contains an error because the developers can return to the last working version with one command.

## CONCLUSION

### Summary

The CourtStars project was containerized by creating a Docker image with PHP, Apache, database extensions, Python dependencies, and the full application source code. The group also created a Docker Compose setup with an app container and a MySQL database container so the project could be tested locally.

For Kubernetes deployment, the group created separate manifests for each component: Namespace, ConfigMap, Secret, PersistentVolumeClaim, MySQL Deployment, MySQL Service, app Deployment, app Service, and HorizontalPodAutoscaler. The app was exposed through a NodePort Service and can also be accessed through `kubectl port-forward`.

The deployment supports self-healing through Deployments and liveness probes. It supports scaling through manual replica changes and the HPA. It supports version updates through rolling updates and rollback through Kubernetes rollout history.

The main challenge was separating configuration from the application code. This was solved by using a ConfigMap for normal settings and a Secret for credentials. Another challenge was making MySQL persistent in Kubernetes, which was solved by using a PersistentVolumeClaim. The last challenge was making the app health-checkable, which was solved by using the `/courtstars/api/test.php` endpoint as the Docker and Kubernetes health check target.

## APPENDIX

### Manifest File 1: 00-namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: courtstars
```

### Manifest File 2: 01-configmap.yaml

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

### Manifest File 3: 02-secret.yaml

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

### Manifest File 4: 03-mysql-pvc.yaml

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

### Manifest File 5: 04-mysql-deployment.yaml

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

### Manifest File 6: 05-mysql-service.yaml

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

### Manifest File 7: 06-app-deployment.yaml

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
        version: "1.0.0"
    spec:
      containers:
        - name: courtstars
          image: courtstars:1.0.0
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

### Manifest File 8: 07-app-service.yaml

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

### Manifest File 9: 08-hpa.yaml

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





Kubernetes was still running the old `courtstars:1.0.0` image. Compose worked because it rebuilt from your current files, but Kubernetes keeps using the image already assigned to the deployment.

I fixed it by:

1. Built a new image from your current files:

```bash
docker build -t courtstars:1.2.0 .
```

2. Updated [k8s/06-app-deployment.yaml](/Applications/XAMPP/xamppfiles/htdocs/courtstars/k8s/06-app-deployment.yaml) from `courtstars:1.0.0` to:

```yaml
image: courtstars:1.2.0
```

3. Applied and rolled out the update:

```bash
kubectl apply -f k8s/06-app-deployment.yaml
kubectl rollout status deployment/courtstars-app -n courtstars
```

It is now running:

```text
courtstars-app   2/2   courtstars:1.2.0
```

I also verified Kubernetes is serving the updated `frontend/index.html`: both the live Kubernetes response and your local file are `47126` bytes.

Use this now:

```bash
kubectl port-forward -n courtstars service/courtstars-app 8088:80
```

Open:

```text
http://127.0.0.1:8088/courtstars/frontend/index.html
```

Port `8080` was already in use on your machine, so `8088` is the clean port to use unless you stop the process currently using `8080`.