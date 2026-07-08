# Local Kubernetes cluster (kind)

This folder contains cluster-level config only. The application itself is
deployed via the Helm chart in `../chart/` — see its README for install,
migrations, and day-to-day operations.

## Layer stack

1. **Cluster** (this folder): kind creates a 3-node cluster from
   `kind-config.yaml` — one control-plane (host port 80 mapped, labeled
   `ingress-ready=true`) and two workers.
2. **Platform**: ingress-nginx controller, installed separately —
   instructions and the kind nodeSelector gotcha are in `../chart/README.md`.
3. **App**: the Helm chart in `../chart/`.

## Create the cluster

    kind create cluster --config deploy/k8s/kind-config.yaml
    kubectl cluster-info --context kind-collabboard
    kubectl get nodes        # 3 nodes Ready within a minute or two

## Destroy / recreate

    kind delete cluster --name collabboard

Deleting the cluster deletes everything in it, including the Postgres PVC
and its data. On recreation, rebuild + `kind load` the app images, reinstall
ingress-nginx, then `helm install` with `--set migrations.run=true` (fresh
Postgres boots empty; the migration hook creates the schema).

## How this was built — Phase 1 (raw manifests)

Before the Helm chart existed, every service was deployed here as numbered
raw manifests, built bottom-up and verified stage by stage. Those files are
superseded and deleted, but live on in git history. The journey, and what
each stage established:

- **Stage 0 — cluster**: 3-node kind cluster; `extraPortMappings` wires host
  port 80 to the control-plane container, `ingress-ready=true` labels it for
  the ingress controller. kind nodes are just Docker containers running
  kubelet + containerd.
- **Stage 1 — redis** (`01-redis.yaml`): first Deployment + Service. Labels
  and selectors as the glue (nothing references by name), self-healing
  (delete the pod, the ReplicaSet replaces it), CoreDNS service discovery
  (`redis` resolves cluster-wide, so `REDIS_URL` is unchanged from Compose).
- **Stage 2 — postgres** (`02` ConfigMap + `03-postgres.yaml`): StatefulSet
  for stable identity (`postgres-0`) and at-most-one semantics, PVC via
  `volumeClaimTemplates` (survives pod deletion, StatefulSet deletion, and
  cluster cold-restarts), Secret via `stringData`, migrations mounted into
  `/docker-entrypoint-initdb.d` as a ConfigMap (an initdb-only shortcut,
  later retired in Phase 2). Readiness probe = `pg_isready`.
- **Stage 3 — api** (`04-api.yaml`): `kind load docker-image` because nodes
  can't see the host Docker daemon (and never tag `:latest` — it forces a
  registry pull). ConfigMap + Secret env, `DB_PASSWORD` referencing the
  postgres Secret (single source of truth). Deep readiness probe
  (`/api/health`, which pings Redis) vs shallow liveness probe (TCP) —
  deep checks gate traffic, shallow checks trigger restarts; never invert.
- **Stage 4 — front** (`05-front.yaml`): same pattern. `port-forward` used
  for pre-ingress verification; HTTP worked, WebSockets didn't — deliberately
  demonstrating the routing job nginx used to do was still vacant.
- **Stage 5 — ingress** (`06-ingress.yaml`): ingress-nginx controller
  (the actual proxy) vs Ingress resource (routing rules) — controller ≈ ALB,
  resource ≈ listener rules. Replicated the old nginx conf: `/api` and
  `/socket.io` → api, `/` → front, WebSocket upgrade automatic, read-timeout
  annotation replacing the 86400s `proxy_read_timeout`.
- **Stage 6 — scale-out**: `kubectl scale deployment api --replicas=3`,
  pods spread across workers, realtime verified across pods — the
  Redis-backed Socket.IO adapter (built for ECS) proving the app is
  genuinely stateless-per-instance on a third orchestrator.

Incidents survived along the way, kept here because they will recur:
ingress-nginx ImagePullBackOff from WSL2 DNS/IPv6 flakiness (fix: proper
`/etc/resolv.conf` + `generateResolvConf=false`, or host-pull + `kind load`
by tag), and the controller scheduling onto a worker while port 80 maps to
the control-plane (fix: the nodeSelector patch in the chart README — root
cause: upstream manifest installed from an unpinned URL).

## Notes

- kind nodes are Docker containers; `docker ps` shows them. A Docker or WSL
  restart stops them — `docker start collabboard-control-plane
  collabboard-worker collabboard-worker2` and the cluster self-heals.
- Host port 80 → control-plane container → ingress controller. This chain is
  why the controller must run on the control-plane node (see the gotcha in
  the chart README).