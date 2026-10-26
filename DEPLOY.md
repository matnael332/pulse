# Deploying pulse on our server

pulse runs on one Linux server we control, with Docker Compose. This guide takes a fresh server
to a running dashboard, API and site server on the synthetic demo customer. The CI `docker` job runs the same
commands on every push, so they are known to work.

## What runs where

| Piece | What it is |
|---|---|
| `pulse:local` image | the whole product: pipeline, dashboard, API (`Dockerfile`) |
| `dashboard` service | Streamlit on port 8501, always up |
| `api` service | prediction API on port 8000, always up |
| `server` service | the site (`pulse-server`) on port 8100: the web pages and their API, sign-in, companies, the operator's approval; migrates the database on start |
| `postgres` service | the server's database (Postgres 17); publishes no port |
| `job` service | runs a command on demand (`synth`, the pipeline); not started by `up` |
| `pulse-data` volume | all customer data, one folder per customer: `/srv/pulse/customers/<slug>/` |
| `pulse-db` volume | the server's database: users, companies, sessions, the audit log |

A customer's folder holds `data/<ingestion>/` (one data folder per upload; the synthetic demo is
the ingestion `synth`), `runs/`, `artifacts/` (the last promoted run), `mappings/`,
`entity_map.csv` and `secret.key`; `backend/pulse_ingest/layout.py` is the reference.

The image holds code only. Customer data, runs and models live in the volume, so rebuilding or
updating the image never touches them. `PULSE_CUSTOMER` (in `.env`, default `demo`) picks the
customer folder the dashboard and the API show.

**Every port listens on the server's localhost only.** The dashboard and the API have no login,
and the server has no HTTPS yet (step 6.9), so nothing is exposed to the internet; you reach them
through an SSH tunnel.

## 1. The server

- Ubuntu 24.04, 4 vCPU, 8 GB RAM, 80 GB disk (e.g. Hetzner CX32 or a DigitalOcean droplet of
  the same size).
- An SSH key at creation; no password login.
- Firewall: allow SSH only.

```bash
sudo ufw allow OpenSSH && sudo ufw enable
```

Sizing: the synthetic demo (200 accounts) is about 145 MB of raw tables and a full run takes a
few minutes. Revisit the size once the real EZtime export size is known.

## 2. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"     # log out and back in once
docker compose version              # v2.24 or newer
```

## 3. The code

```bash
git clone https://github.com/matnael332/pulse.git && cd pulse
cp .env.example .env                # then edit it (below)
docker compose build                # first build takes a few minutes
```

`.env` is required: the server refuses to start in production without `PULSE_SECRET_KEY`
(`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`). Also set
`PULSE_OPERATOR_EMAILS` (your address), `POSTGRES_PASSWORD`, and, for real sign-in, the Google
and Microsoft client ids and secrets. Register these redirect URIs with the providers:
`{PULSE_PUBLIC_URL}/auth/google/callback` and `{PULSE_PUBLIC_URL}/auth/microsoft/callback`. For
Microsoft, add the optional `xms_edov` claim to the ID token, or no Microsoft address counts as
verified (and so none can be an operator). Optional: `GEMINI_API_KEY` for LLM mode,
`PULSE_CUSTOMER`. The same address through Google and through Microsoft is two separate users.

## 4. The demo customer

```bash
C=/srv/pulse/customers/demo
docker compose run --rm job synth --data-dir $C/data/synth
docker compose run --rm job python -m pulse_flow.run --no-llm \
  --spec pulse_specs.workforce_saas.spec:SPEC \
  --data-dir $C/data/synth --runs-dir $C/runs --artifacts-dir $C/artifacts
docker compose up -d
docker compose ps                   # dashboard, api, server and postgres: healthy
```

`$C` expands on the server, and the path is the same inside the container (the volume is
mounted at `/srv/pulse`). Exit code 0 means the run passed the three gates and was promoted to
`$C/artifacts`; 1 means a graceful failure (`$C/runs/<id>/run_status.json` says why).

A real customer's export goes through the ingestion first. Copy the zip into the volume (for
example `docker compose cp export.zip dashboard:/srv/pulse/`), run `pulse-ingest propose`,
`approve` and `apply` with `--customer-dir $C` through `docker compose run --rm job`, then the
pipeline command `apply` prints, with `docker compose run --rm job python` in place of its
leading `uv run python`.

## 5. Open the dashboard

From your own computer:

```bash
ssh -L 8501:localhost:8501 -L 8000:localhost:8000 -L 8100:localhost:8100 <user>@<server>
```

Then browse to http://localhost:8100 (the site), http://localhost:8501 (dashboard) and
http://localhost:8000/health (API). Signing in through the tunnel needs
`PULSE_PUBLIC_URL=http://localhost:8100` (the address in the browser, exactly: `127.0.0.1` is a
different origin and its writes are refused) and that redirect URI registered with the provider.

## Day to day

| Task | Command |
|---|---|
| New run for a customer | the `pulse_flow.run` command above with that customer's `C`, then `docker compose restart api` (the API loads the model at start; the dashboard picks up new files by itself) |
| Show another customer | set `PULSE_CUSTOMER=<slug>` in `.env`, then `docker compose up -d` |
| Update to a new version | `git pull && docker compose up -d --build` |
| Logs | `docker compose logs -f dashboard api server` |
| Approve a company | sign in to the site with an operator's address: it opens on the companies screen |
| Back up the server's database | `docker compose exec -T postgres pg_dump -U pulse pulse > pulse-db-$(date +%F).sql` |
| Back up all customer data | `docker run --rm -v pulse_pulse-data:/srv/pulse -v "$PWD":/backup busybox tar czf /backup/pulse-data-$(date +%F).tgz -C /srv pulse` |
| Stop | `docker compose down` (the volume stays; `down -v` deletes it with all customer data) |

The compose project is named `pulse`, so the volumes are always `pulse_pulse-data` and
`pulse_pulse-db`, and the containers `pulse-dashboard-1`, `pulse-api-1`, `pulse-server-1` and
`pulse-postgres-1`, whatever the folder is called.

## Not yet (the rest of step 6)

The web site on top of the server, uploading a customer's export and a "run" button, HTTPS and a
domain, and a managed database. Until then customer data is copied into the volume by hand and
runs are started from the shell.
