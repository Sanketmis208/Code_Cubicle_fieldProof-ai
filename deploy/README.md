# Deploying FieldProof on a domain

One server, one domain, HTTPS included. Docker Compose runs PostgreSQL, the API, the web app and Caddy (which gets a Let's Encrypt certificate for your domain automatically).

## 1. Point the domain at the server

Create an `A` record for `app.yourdomain.org` to the server's public IP. Ports 80 and 443 must be open.

## 2. Configure

```bash
git clone https://github.com/Sanketmis208/Code_Cubicle_fieldProof-ai.git
cd Code_Cubicle_fieldProof-ai
cp deploy/.env.production.example .env
nano .env   # domain, secrets, Cloudinary, Groq, SMTP
```

Generate secrets with `openssl rand -base64 48`.

## 3. Start

```bash
docker compose up -d --build
docker compose logs -f api   # until "FieldProof API listening"
```

Migrations run automatically when the API starts. Open `https://app.yourdomain.org`, sign up (this creates the first organization) and add your team from **Organization → Members**.

## Updating

```bash
git pull
docker compose up -d --build
```

## Where things run

| Container | Role |
| --- | --- |
| `caddy` | HTTPS on 443, proxies to `web` |
| `web` | nginx serving the built web app; proxies `/api` to `api` |
| `api` | Express API; runs `prisma migrate deploy` on start |
| `db` | PostgreSQL 16 with a persistent volume |

Because the web app and the API share one domain, the session cookie stays `SameSite=Lax` and QR codes on campaign cards point at the public URL (`FRONTEND_URL` is set from `DOMAIN`).

## Mobile app

Build the Flutter app with `--dart-define=API_URL=https://app.yourdomain.org/api`. See `mobile/README.md`.

## Backups

`docker compose exec db pg_dump -U fieldproof fieldproof > backup.sql`. Media lives in Cloudinary.

## Managed hosting instead of a server

The same two images deploy to Render, Railway or Fly: run `backend/Dockerfile` as the API with a managed Postgres, run `frontend/Dockerfile` as the web service with `VITE_API_URL=/api`, and add a rewrite from `/api/*` to the API service so both stay on one domain.
