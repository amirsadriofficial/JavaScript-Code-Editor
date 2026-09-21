# Migration guide: isolated `deploy/` layout

This repository historically had **no** production deployment files. The guide
below covers two cases:

1. **Greenfield** — first time this app goes on the shared server.
2. **Decoupling** — the app (or its domain) was previously served by another
   project's Docker nginx / catch-all config.

## Target architecture

| Concern | Owner |
|---------|--------|
| App container | This repo (`deploy/docker-compose.yml`) |
| Site reverse proxy | This repo (`deploy/nginx.conf` → host `sites-available`) |
| TLS certificates | Server admin (host certbot) |
| Firewall / DNS | Server admin |
| Other projects | Their own repositories |

```text
Browser → host nginx :443 (js-code-editor.conf)
                ↓
         127.0.0.1:4020 → js-code-editor-web container
```

## What this repo must never contain again

- nginx `server_name` entries for other products
- certbot / Let's Encrypt init scripts
- shared Docker networks with other compose projects
- publishing container ports on `0.0.0.0:80` / `:443`
- references to `/etc/nginx/nginx.conf` or global http blocks

## Greenfield (no previous deploy)

1. Copy env and start the stack:
   ```bash
   cd /path/to/js-code-editor/deploy
   cp .env.example .env
   docker compose --env-file .env up -d --build
   curl -sI http://127.0.0.1:4020/
   ```
2. Replace `editor.example.com` in `nginx.conf` with the real domain.
3. Install the site (server admin):
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/js-code-editor.conf
   sudo ln -sf /etc/nginx/sites-available/js-code-editor.conf \
     /etc/nginx/sites-enabled/js-code-editor.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Issue certs with host certbot; reload nginx.
5. Smoke-test `https://<your-domain>/`.

Done. No other repository needs to change.

## Decoupling from a shared / foreign nginx

If another stack (for example an old monorepo Docker nginx) was proxying this
domain or occupying `:80`/`:443`:

### 1. Confirm ownership

```bash
grep -R "your-domain" /etc/nginx/sites-enabled/ 2>/dev/null
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Note which compose project currently binds 80/443 or lists your domain.

### 2. Stand up this app on a free loopback port

```bash
cd /path/to/js-code-editor/deploy
cp .env.example .env
# If 4020 is taken, set APP_PORT and matching upstream in nginx.conf
docker compose --env-file .env up -d --build
curl -sI http://127.0.0.1:4020/
```

### 3. Move TLS to the host (if it lived in Docker)

Prefer re-issuing with host certbot into `/etc/letsencrypt/live/<domain>/`.
Only copy from an old certbot volume if you understand the private-key risk
and paths already match `nginx.conf`.

### 4. Enable this site; remove foreign references

```bash
sudo cp nginx.conf /etc/nginx/sites-available/js-code-editor.conf
sudo ln -sf /etc/nginx/sites-available/js-code-editor.conf \
  /etc/nginx/sites-enabled/js-code-editor.conf
```

In the **other** project's nginx config (in *that* repo, not here): delete
any `server_name` / upstream for this domain. Redeploy or reload that project
on its own schedule.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Free Docker-era edge ports (if applicable)

Only after every site that used the old Docker nginx has its own
`sites-available` entry:

```bash
# from the legacy project directory — example only
# docker compose down   # do not use -v unless you intend to drop data
sudo ss -tlnp | grep -E ':80|:443'
```

Host nginx should be the sole listener on 80/443.

### 6. Smoke test

```bash
curl -sI https://<your-domain>/ | head -5
docker compose -f /path/to/js-code-editor/deploy/docker-compose.yml ps
```

## Rollback

1. `sudo rm /etc/nginx/sites-enabled/js-code-editor.conf && sudo nginx -t && sudo systemctl reload nginx`
2. `cd deploy && docker compose --env-file .env down`
3. Re-enable the previous site symlink only if it still exists and is valid.

## Checklist

- [ ] `deploy/.env` exists and `APP_PORT` matches `nginx.conf` upstream
- [ ] Domain placeholders replaced in `nginx.conf`
- [ ] Container healthy on `127.0.0.1:APP_PORT`
- [ ] Site file only in `sites-available/js-code-editor.conf`
- [ ] No other repo's nginx still lists this domain
- [ ] Certbot cert path matches `ssl_certificate*` directives
- [ ] `nginx -t` clean; HTTPS responds 200
