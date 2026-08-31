# EKODI Dedicated Browser Worker

A small always-on Playwright worker for browser-only tasks that cannot be completed reliably through a direct API.

This service is deliberately separate from Opera Browser Connector and from a person's Windows desktop session. It is intended to run on an EKODI-managed Linux/container worker with automatic restart and persistent browser profiles.

## Security model
- Every control endpoint except `/healthz` requires `Authorization: Bearer <token>`.
- The worker refuses to start without an explicit host allowlist.
- Jobs select a compiled adapter; callers cannot submit JavaScript, shell commands, or arbitrary Playwright code.
- Browser profiles and screenshots live under `/data`, normally backed by a persistent Docker volume.
- The sample Compose file binds to `127.0.0.1` only. Expose it remotely only through an authenticated EKODI gateway, VPN, or tunnel.
- Use this worker only with trusted/approved sites. Do not turn it into a general-purpose open crawler.

## Current adapter
`navigate-snapshot` visits an allowlisted URL, keeps a named persistent browser profile, captures title/body text/status, and writes a full-page PNG artifact.

## Run

```bash
cd services/browser-worker
export EKODI_BROWSER_WORKER_TOKEN='generate-a-long-random-secret'
export EKODI_BROWSER_ALLOWED_HOSTS='example.com,accounts.example.com'
docker compose up -d --build
```

Health check:

```bash
curl http://127.0.0.1:8788/healthz
```

Submit a job:

```bash
curl -X POST http://127.0.0.1:8788/jobs \
  -H "Authorization: Bearer $EKODI_BROWSER_WORKER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"adapter":"navigate-snapshot","input":{"url":"https://example.com","profile":"example"}}'
```

Poll `GET /jobs/<id>` with the same bearer token. Successful snapshot jobs return an authenticated `/artifacts/<id>.png` path.

## Production direction
Add service-specific adapters rather than expanding the API into raw browser control. Good candidates are flows where no stable provider API exists but the steps are repetitive and deterministic. Each adapter should define its permitted hosts, inputs, completion condition, timeout, and retry behavior.

The preferred EKODI execution order remains:

1. Direct provider/API integration
2. Dedicated browser worker
3. Remote Desktop Commander for local-machine exceptions/recovery
4. Opera Browser Connector for human-visible inspection/navigation
5. Manual security approval where the provider requires it
