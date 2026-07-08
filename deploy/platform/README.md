# Platform layer — ArgoCD

Everything in this folder is cluster platform, not application: it is
applied with `kubectl`, not synced by ArgoCD. (ArgoCD cannot bootstrap
itself, and nothing watches this folder — see "The gap" below.)

## What runs here

- **`argocd-install.yaml`** — the ArgoCD install manifest, VENDORED: it was
  downloaded once from the upstream `stable` tag and committed, so what runs
  is pinned by this repo's history, not by whatever upstream main says today
  (lesson learned from the unpinned ingress-nginx install; see the k8s
  README).
- **`collabboard-app.yaml`** — the ArgoCD `Application`: a pointer saying
  "render `deploy/chart` from master of this repo, apply to this cluster."
  `syncPolicy.automated` with `selfHeal: true` and `prune: true` — full
  GitOps: commits deploy themselves, live drift reverts in seconds,
  deletions in git delete live resources. There is no PR gate on this repo,
  so the render-and-read discipline (`helm template`) before pushing chart
  changes is the review.

## Bootstrap (fresh cluster)

    kubectl create namespace argocd
    kubectl apply -n argocd -f deploy/platform/argocd-install.yaml
    kubectl apply -f deploy/platform/collabboard-app.yaml

    # one-time admin password, then ROTATE IT and delete this secret
    kubectl -n argocd get secret argocd-initial-admin-secret \
      -o jsonpath="{.data.password}" | base64 -d; echo

    # UI (no ingress on purpose; tunnel on demand)
    kubectl port-forward svc/argocd-server -n argocd 8080:443
    # → https://localhost:8080 (self-signed cert), user: admin

The repo is public, so no repo credential Secret is needed. If it ever goes
private: a Secret labeled `argocd.argoproj.io/secret-type: repository` with
a read-only PAT, applied by hand, NEVER committed.

## The gap (known, accepted)

`collabboard-app.yaml` itself is outside GitOps — changing the syncPolicy
or source requires `kubectl apply` and the git copy is documentation of
record, not the mechanism. The fix is the app-of-apps pattern (an
Application watching this folder); deliberately deferred.

## Known issues

- `argocd-applicationset-controller` crash-loops periodically (runs ~2 min,
  exits, long backoff). It powers `ApplicationSet` resources, which this
  setup does not use — harmless here. Diagnose with
  `kubectl logs -n argocd deploy/argocd-applicationset-controller --previous`
  or scale it to zero.
- ArgoCD's repo poll is ~3 minutes; a push is not instantly live. Webhooks
  would close the gap; unnecessary locally.

## Operational memory

- The GitOps image pipeline (`.github/workflows/gitops.yml`) once committed
  a tag bump against un-prefixed image names (missing `ghcr.io/ruckerhans/`),
  producing an unpullable reference. Observed behavior worth remembering:
  the rollout STALLED SAFELY — new ReplicaSets sat in ImagePullBackOff while
  the old pods kept serving; zero downtime. Fixed by committing the corrected
  repository values; no kubectl involved. Bad deploys under this machinery
  stall, they don't outage.
- GHCR packages default to PRIVATE even from public repos; kind pulls
  anonymously, so packages must be flipped public once (package → settings →
  change visibility).