# docdo-segmentation — Devtron deployment

Supersedes `k8s.yaml` (kept as reference only — do NOT `kubectl apply` it; the kubectl
deployment/service/secret in ns `docdo` were removed 2026-10-28 after the Devtron-managed
release went live).

## Devtron objects

| Object | Value |
|---|---|
| App | `docdo-segmentation`, **appId 39** (project gameguild) |
| Deployment template | chartRef 46 (deployment-chart 4.22.0), row id 36 |
| CD pipeline | `cd-docdo-seg-prod`, **pipelineId 36**, env production (id 2), MANUAL trigger, helm |
| CI source | External CI (webhook) id 1 — prebuilt registry image, no CI build |
| Env secret | config row 36 (`secret-39` in ns `prod`) — key `DATABASE_URL` |
| Release | `docdo-segmentation-production` in ns **prod** (env production is namespace-locked to `prod`) |
| Service | `docdo-segmentation-production-service` (ClusterIP :8000) |

In-cluster URL: `http://docdo-segmentation-production-service.prod.svc.cluster.local:8000`
(DocDo api `SEG_SERVICE_URL` should point here when it lands on the cluster).

Auth for all API calls: header `token: <apikey>` (see ../infrastructure/infra/services.md §Devtron).
Base URL `https://devtron.gameguild.gg/orchestrator`.

## Deploy a new image tag (image already pushed to registry.gameguild.gg)

1. Register artifact via external-CI webhook (creates ciArtifact, returns nothing useful — poll):

```sh
curl -s -H "token: $TK" -H 'Content-Type: application/json' -X POST \
  "$B/webhook/ext-ci/1" -d '{
    "dockerImage": "registry.gameguild.gg/tolstenko/docdo-segmentation:<TAG>",
    "digest": "",
    "dataSource": "EXTERNAL",
    "materialType": "git",
    "ciProjectDetails": [{"gitRepository":"https://forgejo.gameguild.gg/tolstenko/DocDo-ERP","commitHash":"<TAG>","message":"tag <TAG>"}]
  }'
```

Note: the webhook route requires BOTH `token` (session/apikey auth) — it reads
`api-token` internally too; `token` header works.

2. Find the artifact id: `GET $B/app/cd-pipeline/36/material` → `ci_artifacts[].id`.

3. Trigger CD:

```sh
curl -s -H "token: $TK" -H 'Content-Type: application/json' -X POST \
  "$B/app/cd-pipeline/trigger" -d \
  '{"appId":39,"pipelineId":36,"ciArtifactId":<id>,"cdWorkflowType":"DEPLOY","deploymentWithConfig":"LAST_SAVED_CONFIG"}'
```

(`deploymentWithConfig` MUST be `LAST_SAVED_CONFIG` — anything else 500s.)

4. Verify: `../infrastructure/infra/kc -n prod get pods | grep docdo` + `/health`.

## Config changes

- **Env vars (non-secret)**: deployment template `POST $B/app/template/update` with
  `{"id":36,"appId":39,"chartRefId":46,"valuesOverride":{...}}` (full values object —
  GET current via `$B/app/template/39/46` and modify; include `id:36` or it 404s).
- **Secrets (DATABASE_URL etc.)**: read-modify-write `$B/config/environment/cs`
  (body pattern in services.md; secret values base64; row id 36).
  GET current: `$B/config/data?appName=docdo-segmentation&envName=production&configType=PublishedOnly&resourceId=36&resourceName=secret&resourceType=Secret`.
- Both require a CD re-trigger (step 3 above) to take effect.

## Gotchas learned (2026-10-28)

- CD pipeline `namespace` field is ignored — environment `production` (id 2) is locked
  to ns `prod` (`env.Namespace` check in PropertiesConfig). Release lives in `prod`,
  not `docdo`.
- The template copy from openinary carried a `StartupProbe` on port 3000 `/` —
  crash-looped the pod via probe failure. Template now: Startup/Liveness/Readiness all
  `GET /health` :8000.
- Image must be linux/amd64 (cluster x86).
- EmptyDir store (ephemeral) is fine for mock runner; PVC needed when real volumes land —
  add via template `volumeMounts`/`volumes` + chart values (not yet done).
- Auto-rollback cronjob (ns prod, `infra/k8s/auto-rollback.yaml`) reverts crash-looping
  rollouts — healthy pods are safe.
