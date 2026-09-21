# JS Code Editor — deployment

Self-contained production deployment for **this repository only**.

Host nginx terminates TLS and reverse-proxies to the app container. SSL,
firewall, and DNS are server-admin concerns and live outside this repo.

## Layout

```text
deploy/
├── docker-compose.yml   # Production container (static SPA)
├── nginx.conf           # Site config for this project's domains only
├── .env.example         # Environment template
├── MIGRATION.md         # Cutover from ad-hoc / coupled setups
└── README.md            # This file

Dockerfile               # Multi-stage image (repo root)
.dockerignore
```

| Service | Image | Host port (default) | Role |
|---------|-------|---------------------|------|
| `web` | `Dockerfile` at repo root | `APP_PORT` (4020) on `127.0.0.1` | Serves the built Vite SPA |

## File responsibilities

| File | Responsibility |
|------|----------------|
| `docker-compose.yml` | Build/run `web` on the dedicated `js-code-editor` network. |
| `nginx.conf` | Proxy this project's domains → `127.0.0.1:APP_PORT`. |
| `.env.example` | Port template; copy to `.env` before first run. |
| `../Dockerfile` | Build the SPA and serve it with a container-local static server. |
| `../.dockerignore` | Keep the build context small and free of secrets. |

This repository does **not** own: host nginx install, certbot, firewall, DNS,
or any other project's domains/containers.

## Prerequisites (server)

- Docker 24+ with Compose v2
- Host nginx (`sites-available` / `sites-enabled`)
- Certbot (when serving over HTTPS)
- DNS A/AAAA records for the domains listed in `nginx.conf`
- A free loopback port for `APP_PORT` (default `4020`)

## First-time deploy

### 1. Choose domain and port

1. Edit `nginx.conf`: replace every `editor.example.com` with your real host.
2. If you change the port, set `APP_PORT` in `.env` **and** the same value in
   the `upstream js_code_editor` block inside `nginx.conf`.

### 2. Configure environment

```bash
cd /path/to/js-code-editor/deploy
cp .env.example .env
# edit .env if APP_PORT must differ from 4020
```

### 3. Start the container

```bash
docker compose --env-file .env up -d --build
docker compose ps
curl -sI "http://127.0.0.1:${APP_PORT:-4020}/"
```

Expect `HTTP/1.1 200`.

### 4. Install the nginx site (server admin)

```bash
sudo mkdir -p /var/www/certbot
sudo cp /path/to/js-code-editor/deploy/nginx.conf \
  /etc/nginx/sites-available/js-code-editor.conf
sudo ln -sf /etc/nginx/sites-available/js-code-editor.conf \
  /etc/nginx/sites-enabled/js-code-editor.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Obtain SSL (server admin)

Issue certificates **after** the HTTP server block is live (ACME webroot):

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d editor.example.com -d www.editor.example.com

sudo nginx -t && sudo systemctl reload nginx
```

Use the same domain names you put in `nginx.conf`. Cert paths referenced
there:

- `/etc/letsencrypt/live/<your-domain>/fullchain.pem`
- `/etc/letsencrypt/live/<your-domain>/privkey.pem`

Until certificates exist, comment out the `listen 443` server blocks or
certbot's temporary HTTP-only flow, then enable HTTPS once files are present.

## Day-to-day operations

```bash
cd /path/to/js-code-editor/deploy

docker compose --env-file .env up -d --build   # redeploy after git pull
docker compose logs -f web
docker compose ps
docker compose restart web
docker compose down                           # stop (keeps the image)
```

## Isolation rules

- Compose never joins another project's Docker network.
- `nginx.conf` only mentions this project's domains.
- Ports bind to `127.0.0.1` so only host nginx can reach the container.
- Adding another product on the server means a new `sites-available` entry —
  not editing this repository.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `bind: address already in use` | `APP_PORT` taken | Pick a free port; update `.env` **and** `nginx.conf` upstream |
| `502 Bad Gateway` | Container down or port mismatch | `docker compose ps`; curl `127.0.0.1:APP_PORT` |
| Build fails on `pnpm install` | Registry unreachable | Set `NPM_REGISTRY=https://registry.npmmirror.com` in `.env` and rebuild |
| SSL errors | Cert missing or wrong domain | `sudo ls /etc/letsencrypt/live/`; re-run certbot |
| Stale UI after deploy | Old image / browser cache | `up -d --build`; hard-refresh (hashed assets expire in 7d) |

See [MIGRATION.md](./MIGRATION.md) if you are replacing an older coupled setup.
