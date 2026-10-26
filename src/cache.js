const store = new Map();

/**
 * Obtiene un valor cacheado o ejecuta `fetcher()`.
 * Si `fetcher()` falla y existe un último valor válido en memoria,
 * devuelve ese último valor con `stale: true` para que la tablet nunca quede en blanco.
 */
async function getOrFetch(key, ttlMs, fetcher) {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && now - entry.updatedAt < ttlMs && !entry.inFlight) {
    return {
      ...entry.data,
      cached: true,
      stale: false,
      updated_at: new Date(entry.updatedAt).toISOString()
    };
  }

  if (entry && entry.inFlight) {
    return entry.inFlight;
  }

  const promise = (async () => {
    try {
      const freshData = await fetcher();
      const updatedAt = Date.now();
      store.set(key, {
        data: freshData,
        updatedAt,
        inFlight: null
      });
      return {
        ...freshData,
        cached: false,
        stale: false,
        updated_at: new Date(updatedAt).toISOString()
      };
    } catch (err) {
      if (entry && entry.data) {
        entry.inFlight = null;
        return {
          ...entry.data,
          cached: true,
          stale: true,
          stale_error: err.message,
          updated_at: new Date(entry.updatedAt).toISOString()
        };
      }
      store.delete(key);
      throw err;
    }
  })();

  if (entry) {
    entry.inFlight = promise;
  } else {
    store.set(key, { data: null, updatedAt: 0, inFlight: promise });
  }

  return promise;
}

module.exports = { getOrFetch };
