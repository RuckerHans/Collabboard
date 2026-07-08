# Collabboard Helm chart

Deploys the full Collabboard stack (API, frontend, Redis, Postgres, Ingress)
to a Kubernetes cluster. Developed and tested against a local kind cluster —
see `../k8s/README.md` for the cluster itself and the Phase 1 (raw manifest)
history this chart grew out of.

## Deployment is GitOps

This chart is NOT deployed by hand. ArgoCD (see `../platform/README.md`)
watches `deploy/chart` on `master` with automated sync, self-heal, and prune
enabled:

- **A `git push` to master that changes this chart IS a deploy.** ArgoCD
  polls (~3 min), renders the chart, and converges the cluster. There is no
  `helm upgrade` step and no Sync button to press.
- **Manual cluster changes are drift and will be reverted** within seconds
  (selfHeal). The escape hatch is deliberate: commit the change instead.
- **Removing a template removes the live resource** on the next sync (prune).
- `helm list` still shows the old CLI-era release (last revision 13); it is a
  fossil. Rollback is `git revert`, history is `git log`.

Application code deploys through `.github/workflows/gitops.yml`: push to
master touching `collabboard_api/**` or `collabboard_front/**` → shared test
gate (`tests.yml`) → images built and pushed to GHCR tagged with the commit
SHA → the workflow commits the new tag into `values.yaml`
(`chore: deploy <sha> to k8s [skip ci]`) → ArgoCD converges on that commit.
The `[skip ci]` marker plus the workflow's `paths:` filter prevent the bot
commit from re-triggering CI. Note `yq` rewrites `values.yaml` on every bump
and strips blank lines/comments — don't rely on formatting in that file.

Images are pulled from `ghcr.io/ruckerhans/collabboard-{api,front}` (public
packages — GHCR defaults new packages to private; visibility was flipped
manually once). `kind load` is no longer part of the deploy flow; it remains
useful only for testing an uncommitted local image, in which case point
`values.yaml` at a local tag temporarily — and expect ArgoCD to revert that
the moment it lands in git conflict with your working copy.

## Migrations (runbook)

Migrations are a deliberate, manual action (matching the production
`workflow_dispatch`-only policy). They never run on a normal sync: the gate
is `migrations.run` (default `false`) and a closed gate renders no Job at
all. When enabled, a pre-install/pre-upgrade hook Job runs
`scripts/run-migrations.js` from the API image — the same script and
`schema_migrations` tracking used in production — connecting as the Postgres
owner user, never `collabboard_app`. (The script resolves credentials from
AWS Secrets Manager when `DB_CREDENTIALS_SECRET_ARN` is set, and from plain
env vars otherwise.)

Under GitOps the old `helm upgrade --set migrations.run=true` no longer
exists. The runbook is:

1. Commit `migrations.run: true` in `values.yaml`, push. ArgoCD syncs; the
   hook Job runs to completion BEFORE any other resource changes
   (schema-before-code, enforced). A failed Job fails the sync and no
   workloads move.
2. Check `kubectl logs job/collabboard-migrate`.
3. Commit `migrations.run: false` back, push. (Do not leave the gate open —
   an open gate turns every subsequent sync into a migration run.)

The completed/failed Job is kept for log inspection and cleaned up at the
start of the next migration run (`before-hook-creation`).

## Fresh install

A fresh cluster boots Postgres empty; the migration hook is the only thing
that creates the schema. Bring-up order: kind cluster → ingress-nginx →
ArgoCD + Application (see `../platform/README.md`) — with
`migrations.run: true` committed for the first sync, then flipped back.
The chart can also be installed standalone without ArgoCD
(`helm install collabboard deploy/chart --set migrations.run=true`), which
is useful for chart development but is not the deployed configuration.

## Day-to-day

    # deploy a config change
    edit values.yaml or templates/ → git commit → git push   # that's it

    # inspect
    helm template collabboard deploy/chart    # render locally; your terraform plan
    kubectl get pods                          # reality
    argocd UI                                 # sync status, diffs, history

    # roll back
    git revert <commit> && git push

Always render and read `helm template` output before pushing chart changes —
with automated sync there is no human approval gate between push and
production (this repo has no PR review), so the render IS the review.

Smoke test: open http://localhost in two tabs, two accounts, same board —
presence, cursors, and note drag should sync live across API pods.

## Values that matter

- `api.image.repository` / `.tag`, `front.image.repository` / `.tag` — the
  tag is written by CI; humans normally don't touch it. Never use `:latest`.
- `api.replicas` — declared here; `kubectl scale` is drift and gets reverted.
- `migrations.run` — the migration gate (see runbook above).
- `postgres.credentials.*`, `api.jwtSecret` — local-kind-only credentials,
  knowingly committed in a public repo because they are valid only inside a
  laptop cluster. NEVER replicate this pattern with real credentials; the
  production answer is External Secrets referencing AWS Secrets Manager
  (Phase 4).

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
  StatefulSet and the ConfigMap deleted. Local and production share one
  migration story: same script, same tracking table, same
  deliberate-action gate — different transport.
- **Ingress adoption**: the kubectl-created Ingress was adopted into the
  release via the `meta.helm.sh/release-name` annotation +
  `app.kubernetes.io/managed-by=Helm` label, then templated.

Chart `version` bumps when templates/behavior change; `appVersion` tracks
the application itself and moves independently.