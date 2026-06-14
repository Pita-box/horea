# Provozní dokumentace (Horea)

> Tento dokument shrnuje **provozní (manuální) nastavení** platformy, která nežijí v kódu,
> ale provádí je provozovatel v dashboardech externích služeb (Cloudflare, Vercel, Resend…).
> Změna těchto nastavení se needituje commitem — je to runtime konfigurace infrastruktury.

## Cloudflare WAF — rate limit rezervačního endpointu

### Kontext a problém

Architektura (`architecture/tasks.md`, úkol 5.4) původně počítá s Cloudflare WAF rate limit
pravidlem cíleným na cestu **`/api/reservations`** (max ~10 requestů na IP za minutu).

Veřejná feature `public-business-page` ale rezervace **nevytváří přes REST endpoint
`/api/reservations`**. Vytváření rezervace běží přes **Next.js server action**
(`ReservationCreator`) volanou z veřejné stránky `/[slug]`. Na úrovni HTTP se taková
server action jeví jako **POST na cestu `/{slug}`** (tj. na cestu stránky, ze které je
volána) s hlavičkou **`Next-Action`** (a `Content-Type: text/plain;charset=UTF-8`,
případně multipart). Cesta `/api/reservations` tedy v této feature reálně **neexistuje**,
takže pravidlo cílené jen na ni by rezervační endpoint vůbec nechránilo.

### Doporučené nastavení pravidla

Rate limit pravidlo v Cloudflare WAF je potřeba nastavit tak, aby cílilo na
**POST requesty se hlavičkou `Next-Action`** (tj. na skutečné server-action endpointy),
místo / vedle neexistující cesty `/api/reservations`.

Doporučená konfigurace (Cloudflare dashboard → Security → WAF → Rate limiting rules):

- **Match (výraz):** `http.request.method eq "POST" and any(http.request.headers.names[*] eq "next-action")`
  - Alternativně lze cílit na konkrétní cesty server-action endpointů (POST na `/[slug]`),
    pokud je třeba zúžit rozsah; varianta s hlavičkou `Next-Action` je ale robustnější,
    protože nezávisí na konkrétním slugu.
- **Charakteristika (counting):** IP adresa klienta (`ip.src`).
- **Práh:** ~**10 requestů / IP / minutu**.
  - Přijatelné rozmezí je zhruba **8–15 req/IP/min** (R16.1) — drobná odchylka je v pořádku,
    pokud poskytuje srovnatelnou anti-abuse ochranu. Legitimní klient vytvoří řádově méně
    rezervací, takže tento práh běžný provoz neomezuje.
- **Akce:** Block (nebo Managed Challenge) po dobu okna (např. 1 minuta).

### Proč je to provozní, ne kódové opatření

Anti-abuse je v MVP **vědomě delegován na Cloudflare edge** (R16.1, R16.2). Aplikace
**nezavádí žádný vlastní aplikační rate limit** (per business / per telefon / per e-mail) —
`ReservationCreator` žádné takové omezení neobsahuje. Pravidlo se proto nastavuje **ručně
v Cloudflare dashboardu** a tato dokumentace je jediným místem, kde je zachycena jeho
správná podoba. Pokud se v praxi objeví spam rezervací, řešení je úprava tohoto Cloudflare
pravidla, ne změna aplikačního kódu.

### Související požadavky

- `requirements.md` R16.1 — spoléhání na Cloudflare edge rate limit jako jediný anti-abuse
  mechanismus rezervačního endpointu (~10 req/IP/min, přijatelné 8–15).
- `requirements.md` R16.2 — `ReservationCreator` nezavádí žádný další aplikační rate limit.
- `design.md`, sekce *Routy* a *Bezpečnost* — poznámka k cestě v Cloudflare rate limit pravidle.
