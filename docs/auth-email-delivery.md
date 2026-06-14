# Doručování autentizačních e-mailů (Horea)

> Tento dokument popisuje **skutečné** nastavení odesílání autentizačních e-mailů v aplikaci.
> Vestavěné odesílání e-mailů v Supabase je **vypnuté** — všechny autentizační e-maily
> (potvrzení registrace, znovuzaslání ověření, obnovení hesla) posílá aplikace sama
> přes Supabase Admin API `generateLink` + Resend pomocí šablon definovaných v kódu.

## Rozdělení odesílatelů (auth vs. notifikace rezervací)

Odesílání je rozdělené mezi dva poskytovatele kvůli izolaci limitů:

- **Resend** — kritické a nízkoobjemové e-maily: autentizace (potvrzení registrace,
  znovuzaslání ověření, obnovení hesla), faktury, kontaktní formulář, admin/cron notifikace.
- **SMTP2GO** — vysokoobjemové **notifikace rezervací** (potvrzení klientovi, upozornění
  majiteli, schválení/odmítnutí/úprava/zrušení), které tečou přes `dispatchTransactionalEmail`
  (`src/lib/email/dispatcher.ts`) a odesílají se přes SMTP2GO HTTP API (`src/lib/email/smtp-client.ts`).

Rezervační provoz tak nesdílí denní limit Resendu s loginem/registrací. **Fallback:** bez
`SMTP2GO_API_KEY` se notifikace rezervací pošlou přes Resend (dev/test, rollout). Best-effort
kontrakt zůstává — selhání odeslání nikdy neshodí akci ani nezpůsobí rollback DB.

## Proč to takhle funguje

Supabase by standardně posílal potvrzovací a obnovovací e-maily přes svůj vestavěný
SMTP. Tohle odesílání je v projektu **vypnuté**, takže Supabase žádný e-mail neodešle.
Místo toho aplikace:

1. Vygeneruje odkaz s čerstvým `token_hash` přes `adminClient.auth.admin.generateLink(...)`.
2. Sestaví cílovou URL do aplikace (`/verify-email` nebo `/reset-password`).
3. Vyrenderuje českou e-mailovou šablonu z kódu.
4. Odešle e-mail přes Resend (`sendEmail`).

Díky tomu máme plnou kontrolu nad obsahem i doručením a nezávisíme na šablonách
v Supabase dashboardu.

## Jednotlivé toky a kde jsou implementované

| Tok | `generateLink` typ | Cílová URL | Šablona | Soubor |
|-----|--------------------|------------|---------|--------|
| Potvrzení registrace | `magiclink` | `/verify-email?token_hash=…&type=magiclink` | `renderVerifyEmail` | `src/app/register/actions.ts` → `src/lib/auth/verification-email.ts` |
| Znovuzaslání ověření | `magiclink` | `/verify-email?token_hash=…&type=magiclink` | `renderVerifyEmail` | `src/app/verify-email/actions.ts` → `src/lib/auth/verification-email.ts` |
| Obnovení hesla | `recovery` | `/reset-password?token_hash=…&type=recovery` | `renderPasswordResetEmail` | `src/app/forgot-password/actions.ts` |

### Sdílený helper

Logika pro odeslání ověřovacího e-mailu (registrace i znovuzaslání) je sjednocená v
`src/lib/auth/verification-email.ts` — `sendVerificationEmail(email)`. Helper nikdy
nevyhazuje výjimku: chyby loguje přes `serverLog` a vrací `{ ok, errorMessage? }`.

### Šablony e-mailů

- `src/lib/email/templates/verify-email.ts` — `renderVerifyEmail({ verifyUrl })`
- `src/lib/email/templates/password-reset.ts` — `renderPasswordResetEmail({ resetUrl })`
- `src/lib/email/templates/base.ts` — `wrapEmail()` (společná česká patička Horea)

### Ověření odkazu na straně aplikace

- `/verify-email` ověřuje `token_hash` přes `supabase.auth.verifyOtp({ type: 'magiclink' })`
  v `src/app/verify-email/actions.ts`.
- `/reset-password` ustanovuje relaci přes `supabase.auth.verifyOtp({ type: 'recovery' })`
  v `src/app/reset-password/page.tsx`. Pro zpětnou kompatibilitu se staršími odkazy
  zůstává fallback na `exchangeCodeForSession(code)` pro parametr `?code=`.

## Bezpečnost

- **Neprozrazení existence účtu:** `forgotPasswordAction` vrací vždy stejnou obecnou hlášku
  (`AUTH_MESSAGES.forgotPasswordSent`) bez ohledu na to, zda účet existuje nebo jestli
  `generateLink` selhal. Validační chyba se vrací jen pro neplatný **formát** e-mailu.
- **Čerstvé tokeny:** ověřovací i obnovovací odkazy vždy používají právě vygenerovaný
  `token_hash` z `generateLink`.

## Potřebné proměnné prostředí

| Proměnná | Popis |
|----------|-------|
| `RESEND_API_KEY` | API klíč pro odesílání e-mailů přes Resend. |
| `RESEND_FROM_EMAIL` | Odesílatel, např. `Horea <noreply@horea.cz>`. Musí být z **ověřené** domény v Resend. |

Viz `.env.example`.

## Manuální konfigurace (mimo kód)

1. **Resend — ověření domény:** doména `horea.cz` musí být v Resend ověřená jako sending
   domain (DNS záznamy SPF/DKIM). Bez ověřené domény Resend v testovacím režimu doručí
   e-maily **pouze vlastníkovi Resend účtu** — ostatní příjemci e-mail nedostanou.
   `RESEND_FROM_EMAIL` poté nastav na adresu z této ověřené domény.
2. **Supabase — Authentication → Email:**
   - **Confirm email: ZAPNUTO** (uživatel musí potvrdit e-mail) — díky tomu `signUp`
     vytvoří nepotvrzeného uživatele a my pošleme vlastní potvrzovací odkaz.
   - Vestavěné odesílání e-mailů / SMTP se **nepoužívá** (Supabase žádné autentizační
     e-maily neodesílá). Šablony v Supabase dashboardu nejsou potřeba.
