/**
 * Čistý reducer výběru služeb v kroku 1 rezervačního formuláře (R1.1–R1.3).
 *
 * `Selected_Service_List` je uspořádaný seznam `service_id` v pořadí výběru.
 * Toggle sémantika:
 * - dosud nevybraná služba → přidá se na konec seznamu (zachování pořadí výběru),
 * - již vybraná služba → odebere se ze seznamu.
 *
 * Seznam nikdy neobsahuje duplicity, takže dvojí toggle téže služby je identita.
 * Funkce je čistá — vstupní pole nemutuje, vrací nový seznam.
 */
export function toggleService(list: readonly string[], serviceId: string): string[] {
  return list.includes(serviceId)
    ? list.filter((id) => id !== serviceId)
    : [...list, serviceId];
}
