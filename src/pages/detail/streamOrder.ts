/**
 * Orden de la lista de fuentes de la ficha. La recomendada va primera: su addon arriba de todos y ella
 * primera dentro de él (decisión del usuario, aunque la lista salte una vez cuando llega la recomendación).
 * Lo demás queda en el orden de siempre (el de los addons instalados y el que manda cada uno), así no se
 * mueve nada más.
 */
export function streamOrder(
  groups: readonly { addonUrl: string; count: number }[],
  best?: { addonUrl: string; streamIndex: number },
): { addonIndex: number; bestIndex: number; order: number[] }[] {
  const out = groups.map((g, addonIndex) => {
    const bestIndex = best && best.addonUrl === g.addonUrl && best.streamIndex >= 0 && best.streamIndex < g.count ? best.streamIndex : -1
    const order = Array.from({ length: g.count }, (_, i) => i)
    if (bestIndex >= 0) order.sort((a, b) => Number(b === bestIndex) - Number(a === bestIndex))
    return { addonIndex, bestIndex, order }
  })
  // `sort` es estable: los demás addons quedan como estaban.
  return out.sort((a, b) => Number(b.bestIndex >= 0) - Number(a.bestIndex >= 0))
}
