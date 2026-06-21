// Webhook orchestrace + autorizace — čisté autorizační predikáty.
//
// Tento soubor zatím obsahuje ZÁMĚRNĚ jen dvě čisté funkce a žádné I/O ani
// `import 'server-only'`, aby byly přímo pokryté property testy (viz tasky 3.7, 3.8).
// Orchestraci `handleTelegramUpdate` doplní task 9.1 do téhož souboru později.

/**
 * Čistá funkce: ověří hodnotu hlavičky `X-Telegram-Bot-Api-Secret-Token` proti
 * nakonfigurovanému secretu (R7.1, R7.2). Vrací `false`, když secret není nastaven
 * (`configured === null`, R7.3) nebo když hlavička chybí (`headerValue === null`).
 *
 * Porovnání probíhá v konstantním čase přes akumulátor XOR rozdílů po znacích, aby
 * raná návratnost nevyzradila délku shody. Rozdílná délka hlavičky a secretu vede
 * vždy k `false`, ale porovná se celý nakonfigurovaný secret.
 */
export function isAuthorizedSecret(
  headerValue: string | null,
  configured: string | null,
): boolean {
  // Bez nakonfigurovaného secretu odmítáme vše (R7.3).
  if (configured === null) {
    return false;
  }

  // Chybějící hlavička → neautorizováno.
  if (headerValue === null) {
    return false;
  }

  // Konstantní porovnání: rozdíl délek zaznamenáme do akumulátoru, ale projdeme
  // celý nakonfigurovaný secret, aby raná návratnost nevyzradila délku shody.
  let mismatch = headerValue.length ^ configured.length;
  for (let i = 0; i < configured.length; i++) {
    const headerCode = i < headerValue.length ? headerValue.charCodeAt(i) : 0;
    mismatch |= headerCode ^ configured.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Čistá funkce: `true` právě tehdy, když chat odesílatele odpovídá Operator_Chat_Id
 * (R8.1, R8.2). Porovnává se řetězcová reprezentace `chatId` se stringem
 * `operatorChatId`; pro jakýkoli jiný chat vrací `false`.
 */
export function isOperatorChat(chatId: string | number, operatorChatId: string): boolean {
  return String(chatId) === operatorChatId;
}
