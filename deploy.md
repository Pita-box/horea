# Deploy — Horea na OVH VPS (ruční, rsync)

Dvě věci k zapamatování: .env na VPS se rsyncem nikdy nepřepíše (je vyloučený, edituješ ho přímo na serveru), a změna NEXT_PUBLIC_* proměnných vždy vyžaduje rebuild, ne jen restart.

> Ruční nasazení přes rsync + build na VPS. `git push` na GitHub deploy **neprovede** —
> kód se na VPS dostává rsyncem z lokálního pracovního stromu. Tento dokument je
> jediný zdroj pravdy pro postup a příkazy.

## Architektura

```
Internet → Cloudflare (Full strict, Origin cert)
   → nginx (VPS :443, Origin cert)
       ├─ horea.cz, www.horea.cz   → 127.0.0.1:3200  (kontejner horea-web, Next.js)
       └─ supabase.horea.cz        → 127.0.0.1:8000  (kong → self-hosted Supabase)
```

- **Horea app**: Docker kontejner `horea-web` (Next.js 15 standalone), port `127.0.0.1:3200`.
- **Self-hosted Supabase**: Docker Compose stack v `/opt/apps/supabase` (db, auth, rest, storage, kong…).
- **Soused na stejném VPS**: `maietek-prod` (jiné domény/porty) — **NESAHAT**.
- Vše `restart: unless-stopped` → přežije reboot.

## Klíčové cesty a fakta

| Co | Kde |
|---|---|
| SSH | `ssh -i ~/.ssh/horea_vps ubuntu@141.227.135.23` |
| Zdroják appky na VPS | `/opt/apps/horea/app/` |
| Produkční env (tajemství, MIMO git) | `/opt/apps/horea/app/.env` |
| Docker image / kontejner | `horea-web:latest` / `horea-web` |
| Compose appky | `/opt/apps/horea/app/docker-compose.yml` |
| Supabase stack | `/opt/apps/supabase/` (`.env`, `docker-compose.yml`, `run.sh`) |
| Záloha DB (skript) | `/opt/apps/horea/backup-db.sh` (cron `0 3 * * *`) |
| Zálohy DB (výstup) | `/opt/backups/horea/` (rotace 7) |
| nginx site appky | `/etc/nginx/sites-available/horea.conf` |
| nginx site Supabase | `/etc/nginx/sites-available/supabase-horea.conf` |
| Cloudflare Origin cert | `/etc/ssl/cloudflare/horea-origin.pem` + `.key` |

> **Pozn.:** Docker vyžaduje na VPS `sudo` (uživatel `ubuntu` není v `docker` group),
> proto všechny docker příkazy běží přes `sudo docker …`. `sudo` je NOPASSWD.

---

## TL;DR — vydání nové verze

Z **rootu repa na Macu**:

```bash
# 1) (volitelně) commit + push pro historii
git push origin mvp-snapshot

# 2) nahrát zdroják na VPS (chrání .env i node_modules na VPS)
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude 'coverage' --exclude 'playwright-report' --exclude 'test-results' \
  --exclude '.env' --exclude '.env.*' --exclude '.DS_Store' \
  -e "ssh -i ~/.ssh/horea_vps -o BatchMode=yes" \
  ./ ubuntu@141.227.135.23:/opt/apps/horea/app/

# 3) rebuild + restart na VPS
ssh -i ~/.ssh/horea_vps ubuntu@141.227.135.23 \
  'cd /opt/apps/horea/app && sudo docker tag horea-web:latest horea-web:prev 2>/dev/null; sudo docker compose build && sudo docker compose up -d'

# 4) ověření
curl -s -o /dev/null -w "horea.cz http=%{http_code}\n" https://horea.cz/
```
---

## Detailní postup krok za krokem

### Krok 1 — (Mac) ověř změny lokálně

```bash
pnpm lint
pnpm test:run
pnpm build        # ověří, že standalone build projde i lokálně
```

### Krok 2 — (Mac) commit + push (historie)

```bash
git add -A
git commit -m "<popis změny>"
git push origin mvp-snapshot
```

### Krok 3 — (Mac) rsync zdrojáku na VPS

Spouštěj **z rootu repa**. `--delete` smaže na VPS soubory, které už nejsou ve zdroji,
ale `--exclude` chrání `.env` (produkční tajemství) a build artefakty.

```bash
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' \
  --exclude 'coverage' --exclude 'playwright-report' --exclude 'test-results' \
  --exclude '.env' --exclude '.env.*' --exclude '.DS_Store' \
  -e "ssh -i ~/.ssh/horea_vps -o BatchMode=yes" \
  ./ ubuntu@141.227.135.23:/opt/apps/horea/app/
```

> `.env` na VPS se **nikdy** nepřepisuje rsyncem (je vyloučený). Když měníš env
> proměnné, edituj přímo `/opt/apps/horea/app/.env` na VPS (viz sekce „Změna env").

### Krok 4 — (VPS) rebuild image

```bash
ssh -i ~/.ssh/horea_vps ubuntu@141.227.135.23
cd /opt/apps/horea/app

# záloha aktuálního image pro případný rollback
sudo docker tag horea-web:latest horea-web:prev

# build (čte NEXT_PUBLIC_* z .env jako build args; trvá ~1–2 min)
sudo docker compose build
```

> **Proč rebuild a ne jen restart:** `NEXT_PUBLIC_*` proměnné (Supabase URL/anon klíč,
> R2 URL) se zapékají do klientského bundlu při buildu. Změna kódu i těchto proměnných
> proto vyžaduje rebuild, ne jen restart.

### Krok 5 — (VPS) restart kontejneru s novým image

```bash
sudo docker compose up -d
# krátký výpadek (~vteřiny), než nový kontejner naběhne
```

### Krok 6 — ověření

```bash
# na VPS — lokální probe
curl -s -o /dev/null -w "app http=%{http_code}\n" http://127.0.0.1:3200/
sudo docker ps --filter name=horea-web --format "{{.Names}} {{.Status}}"

# z Macu — přes Cloudflare
curl -s -o /dev/null -w "horea.cz http=%{http_code}\n" https://horea.cz/
curl -s -o /dev/null -w "u-lipy http=%{http_code}\n" https://horea.cz/u-lipy
```

### Krok 7 — úklid starých image (občas)

```bash
sudo docker image prune -f      # smaže dangling image z předchozích buildů
```

---

## Užitečné VPS příkazy (Horea app)

```bash
cd /opt/apps/horea/app

sudo docker compose ps                 # stav kontejneru
sudo docker compose logs -f            # živé logy (Ctrl+C ukončí)
sudo docker compose logs --tail=200    # posledních 200 řádků
sudo docker compose restart            # restart bez rebuildu
sudo docker compose up -d              # aplikovat změny compose / nový image
sudo docker compose down               # zastavit a odstranit kontejner
sudo docker stats horea-web --no-stream # CPU/RAM kontejneru
sudo docker exec -it horea-web sh      # shell uvnitř kontejneru
```

### Rollback na předchozí verzi

Pokud nová verze zlobí a předtím jsi udělal `docker tag … horea-web:prev`:

```bash
cd /opt/apps/horea/app
sudo docker tag horea-web:prev horea-web:latest
sudo docker compose up -d
```

Alternativně přes git: vrať změnu (`git revert`), znovu rsync + build + up.

---

## Self-hosted Supabase — správa

Stack se ovládá přes `run.sh` (obal nad docker compose) nebo přímo `sudo docker compose`.

```bash
cd /opt/apps/supabase

sudo sh run.sh status          # stav všech služeb
sudo sh run.sh logs            # logy všech služeb
sudo sh run.sh logs auth       # logy jedné služby (auth/db/rest/kong/storage…)
sudo sh run.sh restart         # restart celého stacku
sudo sh run.sh restart auth    # restart jedné služby
sudo sh run.sh stop            # zastavit stack
sudo sh run.sh start           # spustit stack (up -d --wait)

# přímý SQL přístup do DB
sudo docker exec -it supabase-db psql -U postgres -d postgres
```

> Po editaci `/opt/apps/supabase/.env` je nutné služby **recreate**, ne jen restart:
> `sudo sh run.sh recreate`. Pozor: měnit Supabase tajemství (JWT_SECRET, klíče)
> by rozbilo přihlášené relace i wiring v Horea `.env` — needělej bez rozmyslu.

---

## Změna env proměnných (produkční .env)

Produkční tajemství appky jsou v `/opt/apps/horea/app/.env` (mimo git, chmod 600).

```bash
ssh -i ~/.ssh/horea_vps ubuntu@141.227.135.23
nano /opt/apps/horea/app/.env       # uprav hodnotu

cd /opt/apps/horea/app
# Runtime proměnná (GoPay, Resend, Telegram, CRON_SECRET…): stačí restart
sudo docker compose up -d

# NEXT_PUBLIC_* proměnná (zapečená do klienta): nutný rebuild
sudo docker compose build && sudo docker compose up -d
```

| Typ proměnné | Co stačí |
|---|---|
| `NEXT_PUBLIC_*` (Supabase URL/anon, R2 URL) | **rebuild** + up |
| Server-only (service role, GoPay, Resend, SMTP2GO, Google, Telegram, CRON) | jen **restart** (`up -d`) |
---

## Zálohy DB a obnova

### Automatická záloha

Cron (`ubuntu`, denně 03:00) → `pg_dump` self-hosted DB → gzip do `/opt/backups/horea`, rotace 7.

```bash
crontab -l                                  # ověřit naplánování
sudo ls -lah /opt/backups/horea/            # existující zálohy
/opt/apps/horea/backup-db.sh                # ruční spuštění zálohy
cat /var/log/horea-backup.log               # log záloh
```

### Obnova ze zálohy

```bash
# rozbalit a nahrát do DB (POZOR: --clean v dumpu přepíše existující objekty)
gunzip -c /opt/backups/horea/horea-db-<TS>.sql.gz \
  | sudo docker exec -i supabase-db psql -U postgres -d postgres
```

---

## nginx / TLS

```bash
sudo nginx -t                               # test konfigurace
sudo systemctl reload nginx                 # aplikovat změny
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# site konfigurace
sudo nano /etc/nginx/sites-available/horea.conf          # horea.cz → :3200
sudo nano /etc/nginx/sites-available/supabase-horea.conf # supabase.horea.cz → :8000
```

- TLS: Cloudflare **Full (strict)** + Origin cert v `/etc/ssl/cloudflare/horea-origin.{pem,key}`
  (platnost do 2041, není potřeba obnovovat jako Let's Encrypt).
- Mapa `$connection_upgrade` (websockety) je definovaná v `maietek.conf` a sdílí se —
  v `horea.conf`/`supabase-horea.conf` se znovu **nedefinuje** (jinak „duplicate map").

---

## Troubleshooting

| Příznak | Postup |
|---|---|
| `horea.cz` vrací **526** (Cloudflare) | Origin cert/nginx problém: `sudo nginx -t`, ověř `/etc/ssl/cloudflare/horea-origin.*`, Cloudflare SSL mód = Full (strict). |
| `horea.cz` vrací **502/504** | Kontejner neběží/neodpovídá: `sudo docker compose ps`, `logs -f`, `curl 127.0.0.1:3200`. |
| Build spadne na chybě | Přečti výstup `sudo docker compose build`; často chybějící build arg v `.env` nebo TS/lint chyba — ověř lokálně `pnpm build`. |
| Appka běží, ale data nejedou | Zkontroluj `.env` Supabase proměnné a stav Supabase: `cd /opt/apps/supabase && sudo sh run.sh status`. |
| Přihlášení nefunguje | `sudo sh run.sh logs auth`; ověř `SITE_URL`/`API_EXTERNAL_URL` v `/opt/apps/supabase/.env`. |
| Málo RAM | `free -h`, `sudo docker stats --no-stream`; stack + app jedou ~3 GB z 8 GB. |
| Port obsazený / kolize | `sudo ss -tlnp` (Horea `127.0.0.1:3200`, Supabase `127.0.0.1:8000`). |

### Rychlý health snapshot

```bash
ssh -i ~/.ssh/horea_vps ubuntu@141.227.135.23 \
  'sudo docker ps --format "{{.Names}}\t{{.Status}}" | sort; echo; free -h | head -2'
```

---

## Po deployi — checklist

- [ ] `curl https://horea.cz/` → 200
- [ ] Přihlášení do existujícího účtu funguje
- [ ] Publikovaný profil podniku renderuje data
- [ ] Telegram webhook (po změně domény) přeregistrovat: `setWebhook` na
      `https://horea.cz/api/telegram/webhook` se secret tokenem z `.env`
- [ ] GoPay webhook v merchant administraci míří na `https://horea.cz/api/webhooks/gopay`

---

## Co NEdělat

- Nesahat na `maietek-prod` (kontejnery, `/opt/apps/maietek`, `maietek.conf`).
- Necommitovat `/opt/apps/horea/app/.env` ani Cloudflare klíč do gitu.
- Neměnit Supabase JWT tajemství bez současné aktualizace Horea `.env` (rozbije auth).
- Nepoužívat `npm`/`npx` — projekt jede na `pnpm`.
