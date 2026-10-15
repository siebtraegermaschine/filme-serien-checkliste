// Stale-while-revalidate fuer prozessinterne Caches: abgelaufene Eintraege
// liefern sofort den alten Wert, der Neuaufbau laeuft im Hintergrund. Parallele
// Aufbauten desselben Schluessels werden zusammengelegt (wie IM_BAU in
// listenCache.js). Nur der allererste Aufbau eines Schluessels wartet.
const IM_BAU = new WeakMap();   // map -> Map(key -> Promise)

function aufbau(map, key, laden) {
  let laufend = IM_BAU.get(map);
  if (!laufend) IM_BAU.set(map, (laufend = new Map()));
  if (laufend.has(key)) return laufend.get(key);
  const p = (async () => {
    const wert = await laden();
    map.set(key, { at: Date.now(), wert });
    return wert;
  })().finally(() => laufend.delete(key));
  laufend.set(key, p);
  return p;
}

export function swrCache(map, key, ttl, laden) {
  const e = map.get(key);
  if (!e) return aufbau(map, key, laden);
  if (Date.now() - e.at >= ttl) {
    aufbau(map, key, laden).catch((err) => console.error(`swrCache ${key}:`, err.message));
  }
  return Promise.resolve(e.wert);
}
