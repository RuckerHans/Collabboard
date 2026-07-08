# Collabboard Helm chart

Deploys the full Collabboard stack (API, frontend, Redis, Postgres, Ingress)
to a Kubernetes cluster. Developed and tested against a local kind cluster —
see `../k8s/README.md` for the cluster itself and the Phase 1 (raw manifest)
history this chart grew out of.

## Prerequisites

- A kind cluster created from `../k8s/kind-config.yaml` (port 80 mapped,
  control-plane labeled `ingress-ready=true`)
- ingress-nginx controller installed separately (platform, not app — it is
  deliberately NOT part of this chart; the chart owns the Ingress *resource*,
  the app's routing declaration, while the controller belongs to the cluster
  bootstrap layer):

      kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml

  **kind gotcha:** current upstream manifests may ship without the
  `ingress-ready` nodeSelector, letting the controller schedule onto a worker
  node while the host's port-80 mapping points at the control-plane. If
  `curl http://localhost` gets connection reset, pin it:

      kubectl -n ingress-nginx patch deploy ingress-nginx-controller \
        -p '{"spec":{"template":{"spec":{"nodeSelector":{"ingress-ready":"true","kubernetes.io/os":"linux"}}}}}'

- App images built and loaded into the kind nodes (kind nodes cannot see the
  host Docker daemon; every rebuild needs a re-load — and a same-tag rebuild
  is invisible to already-running pods):

      docker build -t collabboard-api:kind ./collabboard_api
      docker build -t collabboard-front:kind \
        --build-arg NEXT_PUBLIC_API_URL=/api \
        --build-arg NEXT_PUBLIC_SOCKET_URL="" \
        ./collabboard_front
      kind load docker-image collabboard-api:kind --name collabboard
      kind load docker-image collabboard-front:kind --name collabboard

## Install

Fresh installs MUST run migrations — Postgres boots empty and the migration
hook is the only thing that creates the schema:

    helm install collabboard deploy/chart --set migrations.run=true

## Migrations

Migrations are a deliberate, manual action (matching the production
`workflow_dispatch`-only policy). They never run on a plain upgrade.
The gate is `migrations.run` (default `false`); when enabled, a
pre-install/pre-upgrade hook Job runs `scripts/run-migrations.js` from the
API image — the same script and `schema_migrations` tracking used in
production — connecting as the Postgres owner user, never `collabboard_app`.
(The script resolves credentials from AWS Secrets Manager when
`DB_CREDENTIALS_SECRET_ARN` is set, and from plain env vars otherwise —
that fallback is what makes the same script work in both worlds.)

    helm upgrade collabboard deploy/chart --set migrations.run=true

A failed migration aborts the upgrade before any workload changes
(schema-before-code, enforced). The Job is kept after each run for
`kubectl logs job/collabboard-migrate`; it is cleaned up at the start of
the next migration run (`before-hook-creation`).

## Day-to-day

    helm upgrade collabboard deploy/chart      # normal deploy, no migrations
    helm list                                  # release status + revision
    helm rollback collabboard <revision>       # instant rollback
    helm template collabboard deploy/chart     # render locally, apply nothing

Always render (`helm template`) and read the output before upgrading —
the Helm equivalent of reviewing `terraform plan`. Helm stores each
revision's rendered manifests as `sh.helm.release.v1.*` Secrets in the
namespace; that is the entire "state" mechanism behind rollback.

Smoke test: open http://localhost in two tabs, two accounts, same board —
presence, cursors, and note drag should sync live across API pods.

## How this chart was built — Phase 2

The chart was hand-built from the Phase 1 raw manifests (not `helm create`),
one service per stage, rendering and verifying each before the next:

- **Redis first** (simplest): extracted only what plausibly varies
  (image, replicas) into `values.yaml`. Names stay hardcoded on purpose —
  `api-config` wires `redis://redis:6379` and `DB_HOST: postgres`, so stable
  names are a requirement, not laziness. Verified install → upgrade →
  rollback (revisions append; rollback creates a new revision equal to an
  old one, like `git revert`).
- **Postgres**: Secret/StatefulSet/Service templated; the PVC survived the
  kubectl→Helm ownership handover (deleting a StatefulSet never deletes
  PVCs from its `volumeClaimTemplates`).
- **api + front**: templated image/replicas/config; `api.replicas: 3` moved
  a previously imperative `kubectl scale` into declared, versioned state.
- **`_helpers.tpl`**: one shared `collabboard.labels` helper for the
  `app.kubernetes.io/*` label set on every object's top-level metadata —
  and nothing else. Deliberately under-DRY: two readable templates beat one
  clever abstraction. Labels never touch `selector.matchLabels` (immutable)
  or pod template labels (forces rollouts).
- **Migration hook** (the centerpiece): gated Job
  (`templates/migrate-job.yaml`), `backoffLimit: 0`, `restartPolicy: Never`
  — fail once, loudly, keep the pod for logs. Its first run adopted the
  initdb-created database: the script detected the post-004 schema and
  seeded `schema_migrations` with the four legacy records (all sharing one
  `applied_at` timestamp — the adoption fingerprint).
- **initdb retirement**: with migrations first-class, the
  `docker-entrypoint-initdb.d` ConfigMap mount was removed from the
  StatefulSet and the ConfigMap deleted. Local and production now share one
  migration story: same script, same tracking table, same
  deliberate-action gate — different transport.
- **Ingress adoption**: the kubectl-created Ingress was adopted into the
  release via the `meta.helm.sh/release-name` annotation +
  `app.kubernetes.io/managed-by=Helm` label, then templated.

Chart `version` bumps when templates/behavior change (0.1.0 → 0.2.0 covered
the hook, the Ingress, and the initdb retirement); `appVersion` tracks the
application itself and moves independently.