import 'server-only';

/**
 * Tenký server-only wrapper nad GoPay REST API.
 *
 * Wrapper drží JEN to, co potřebuje aktuální platební vrstva (Billing_Engine,
 * task 10.1 — založení recurring schedule). Záměrně nezavádí spekulativní
 * metody. Veškerá HTTP komunikace je zapouzdřena v jediném privátním `request`
 * helperu a `fetch` se injektuje, aby šel klient v testech triviálně mockovat
 * bez reálného volání GoPay.
 *
 * Konfigurace (GOID, OAuth client ID/secret, base URL) se čte výhradně z
 * prostředí přes {@link loadGopayConfig} — nikdy natvrdo. Tajemství se NIKDY
 * neloguje a neobjevuje se v chybových hláškách (ty referencují jen názvy env
 * proměnných, ne hodnoty). Viz design.md, sekce *GoPay integrace*.
 *
 * Model recurring plateb GoPay (on-demand): recurrence se definuje na první
 * (rodičovské) platbě při checkoutu; jakmile je rodičovská platba zaplacena,
 * je schedule „založen" a jeho kotvou je ID rodičovské platby. Následná
 * měsíční strhávání se kolektují přes `create-recurrence` (task 10.2, mimo
 * rozsah). Tento wrapper proto pro task 10.1 ověří stav recurrence rodičovské
 * platby a vrátí její ID jako identifikátor schedule.
 */

/** Konfigurace GoPay načtená z prostředí. */
export interface GopayConfig {
  /** Merchant GOID. */
  goId: string;
  /** OAuth client ID. */
  clientId: string;
  /** OAuth client secret. */
  clientSecret: string;
  /** Base URL REST API (bez koncového lomítka). */
  apiBaseUrl: string;
}

/** Stav recurring schedule odvozený z rodičovské platby. */
export interface GopayRecurrence {
  /** Identifikátor schedule — ID rodičovské (první) platby. */
  scheduleId: string;
  /** `true`, pokud je recurrence v GoPay aktivní a lze ji strhávat. */
  active: boolean;
}

/** Vstup pro vytvoření první (rodičovské) platby na bráně GoPay. */
export interface GopayCreatePaymentInput {
  /** Částka v CZK (celé koruny) — interně se převede na haléře. */
  amountCzk: number;
  /** Variabilní symbol = `order_number` platby (1–10 číslic). */
  variableSymbol: string;
  /** Popis objednávky zobrazený plátci. */
  description: string;
  /** E-mail plátce (předvyplnění kontaktu na bráně). Nepovinné. */
  payerEmail?: string;
  /** URL návratu po dokončení platby na bráně. */
  returnUrl: string;
  /** URL pro server-to-server notifikaci (webhook). */
  notificationUrl: string;
  /**
   * `true` = inicializovat recurring (ON_DEMAND) recurrence na této platbě, aby
   * šlo později strhávat měsíčně (Billing_Engine). `false` = jednorázová platba.
   */
  recurring: boolean;
}

/** Výsledek vytvoření platby — ID a URL platební brány pro přesměrování. */
export interface GopayCreatedPayment {
  /** GoPay ID vytvořené platby (uloží se do `payments.gopay_payment_id`). */
  paymentId: string;
  /** URL platební brány, na kterou se přesměruje plátce. */
  gatewayUrl: string;
}

/** Vstup pro měsíční strhnutí přes existující recurring schedule. */
export interface GopayChargeRecurrenceInput {
  /** ID rodičovské platby / schedule (`subscriptions.gopay_schedule_id`). */
  scheduleId: string;
  /** Částka v CZK (celé koruny) — interně se převede na haléře. */
  amountCzk: number;
  /** Variabilní symbol nového (potomkovského) platebního pokusu. */
  variableSymbol: string;
  /** Popis objednávky. */
  description: string;
}

/** Výsledek strhnutí recurrence — ID nové (potomkovské) platby. */
export interface GopayChargeResult {
  /** GoPay ID nově vytvořené potomkovské platby. */
  paymentId: string;
}

/** Veřejný kontrakt GoPay klienta (umožňuje mockování v testech). */
export interface GopayClient {
  /**
   * Ověří stav recurring schedule rodičovské platby a vrátí jeho identifikátor.
   *
   * @param parentPaymentId GoPay ID první (rodičovské) platby, na které je
   *   recurrence definována.
   */
  getRecurrence(parentPaymentId: string): Promise<GopayRecurrence>;

  /**
   * Vytvoří na bráně GoPay novou platbu (volitelně s inicializací recurring
   * ON_DEMAND recurrence) a vrátí její ID + URL brány pro přesměrování plátce.
   */
  createPayment(input: GopayCreatePaymentInput): Promise<GopayCreatedPayment>;

  /**
   * Iniciuje měsíční strhnutí přes existující recurring schedule (rodičovskou
   * platbu) a vrátí ID nově vytvořené potomkovské platby.
   */
  chargeRecurrence(input: GopayChargeRecurrenceInput): Promise<GopayChargeResult>;
}

/** Injektovatelné závislosti (pro testy). */
export interface GopayClientDeps {
  /** HTTP klient; default globální `fetch`. */
  fetch?: typeof fetch;
  /** Timeout jednoho volání v ms; default 10 000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Konec platnosti ON_DEMAND recurrence předané GoPay při vytvoření první platby.
 * Recurring předplatné nemá pevný konec; volíme vzdálené datum, dokud podnik
 * recurrence sám nezruší (zrušení auto-obnovy, task 14.x).
 */
const RECURRENCE_DATE_TO = '2099-12-31';

/** Stavy recurrence GoPay, které znamenají použitelný (aktivní) schedule. */
const ACTIVE_RECURRENCE_STATES = new Set(['REQUESTED', 'STARTED']);

function requireEnv(name: 'GOPAY_GOID' | 'GOPAY_CLIENT_ID' | 'GOPAY_CLIENT_SECRET' | 'GOPAY_API_BASE_URL'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Chybí konfigurace GoPay — proměnná prostředí ${name} není nastavena.`);
  }
  return value;
}

/**
 * Načte konfiguraci GoPay z prostředí. Tajemství se nikam neloguje; při chybějící
 * proměnné vyhodí chybu referencující jen její název, ne hodnotu.
 */
export function loadGopayConfig(): GopayConfig {
  return {
    goId: requireEnv('GOPAY_GOID'),
    clientId: requireEnv('GOPAY_CLIENT_ID'),
    clientSecret: requireEnv('GOPAY_CLIENT_SECRET'),
    apiBaseUrl: requireEnv('GOPAY_API_BASE_URL').replace(/\/+$/, ''),
  };
}

/**
 * Vytvoří GoPay klienta. Konfiguraci lze předat explicitně (jinak se načte z
 * prostředí), stejně jako `fetch`/timeout pro testy.
 */
export function createGopayClient(config?: GopayConfig, deps: GopayClientDeps = {}): GopayClient {
  const resolvedConfig = config ?? loadGopayConfig();
  const httpFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Získá OAuth2 access token (client_credentials, scope payment-all). */
  async function getAccessToken(signal: AbortSignal): Promise<string> {
    const basic = Buffer.from(`${resolvedConfig.clientId}:${resolvedConfig.clientSecret}`).toString(
      'base64',
    );

    const response = await httpFetch(`${resolvedConfig.apiBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials&scope=payment-all',
      signal,
    });

    if (!response.ok) {
      throw new Error(`GoPay OAuth token selhal (HTTP ${response.status}).`);
    }

    const json = (await response.json()) as { access_token?: unknown };
    if (typeof json.access_token !== 'string' || json.access_token.length === 0) {
      throw new Error('GoPay OAuth token: odpověď neobsahuje access_token.');
    }
    return json.access_token;
  }

  async function getRecurrence(parentPaymentId: string): Promise<GopayRecurrence> {
    return withTimeout(async (signal) => {
      const token = await getAccessToken(signal);

      const response = await httpFetch(
        `${resolvedConfig.apiBaseUrl}/payments/payment/${encodeURIComponent(parentPaymentId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`GoPay dotaz na platbu selhal (HTTP ${response.status}).`);
      }

      const json = (await response.json()) as {
        id?: unknown;
        recurrence?: { recurrence_state?: unknown } | null;
      };

      const scheduleId =
        typeof json.id === 'string'
          ? json.id
          : typeof json.id === 'number'
            ? String(json.id)
            : parentPaymentId;

      const state = json.recurrence?.recurrence_state;
      const active = typeof state === 'string' && ACTIVE_RECURRENCE_STATES.has(state);

      return { scheduleId, active };
    });
  }

  /** Převede částku v CZK (celé koruny) na haléře, které GoPay očekává. */
  function toHalere(amountCzk: number): number {
    return Math.round(amountCzk * 100);
  }

  /** Z odpovědi GoPay vytáhne ID platby jako string (přijímá number i string). */
  function extractPaymentId(json: { id?: unknown }): string {
    if (typeof json.id === 'string' && json.id.length > 0) {
      return json.id;
    }
    if (typeof json.id === 'number') {
      return String(json.id);
    }
    throw new Error('GoPay odpověď neobsahuje ID platby.');
  }

  async function createPayment(input: GopayCreatePaymentInput): Promise<GopayCreatedPayment> {
    return withTimeout(async (signal) => {
      const token = await getAccessToken(signal);
      const amount = toHalere(input.amountCzk);

      const body: Record<string, unknown> = {
        amount,
        currency: 'CZK',
        order_number: input.variableSymbol,
        order_description: input.description,
        items: [{ name: input.description, amount }],
        target: { type: 'ACCOUNT', goid: resolvedConfig.goId },
        callback: {
          return_url: input.returnUrl,
          notification_url: input.notificationUrl,
        },
      };

      if (input.payerEmail) {
        body.payer = { contact: { email: input.payerEmail } };
      }

      if (input.recurring) {
        // ON_DEMAND recurrence — strhávání iniciuje Billing_Engine (create-recurrence).
        body.recurrence = {
          recurrence_cycle: 'ON_DEMAND',
          recurrence_date_to: RECURRENCE_DATE_TO,
        };
      }

      const response = await httpFetch(`${resolvedConfig.apiBaseUrl}/payments/payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`GoPay vytvoření platby selhalo (HTTP ${response.status}).`);
      }

      const json = (await response.json()) as { id?: unknown; gw_url?: unknown };
      const gatewayUrl = typeof json.gw_url === 'string' ? json.gw_url : '';
      if (gatewayUrl.length === 0) {
        throw new Error('GoPay odpověď neobsahuje URL platební brány (gw_url).');
      }

      return { paymentId: extractPaymentId(json), gatewayUrl };
    });
  }

  async function chargeRecurrence(input: GopayChargeRecurrenceInput): Promise<GopayChargeResult> {
    return withTimeout(async (signal) => {
      const token = await getAccessToken(signal);
      const amount = toHalere(input.amountCzk);

      const response = await httpFetch(
        `${resolvedConfig.apiBaseUrl}/payments/payment/${encodeURIComponent(input.scheduleId)}/create-recurrence`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency: 'CZK',
            order_number: input.variableSymbol,
            order_description: input.description,
            items: [{ name: input.description, amount }],
          }),
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`GoPay strhnutí recurrence selhalo (HTTP ${response.status}).`);
      }

      const json = (await response.json()) as { id?: unknown };
      return { paymentId: extractPaymentId(json) };
    });
  }

  return { getRecurrence, createPayment, chargeRecurrence };
}
