/** El navegador pidió ahorrar datos (Chrome/Android: "Ahorro de datos" o "Modo ligero"). */
export function saveDataOn(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return !!conn?.saveData
}
