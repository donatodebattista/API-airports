const fs = require('fs');
const path = require('path');
const { redisGeo, redisPop } = require('./db');
const Airport = require('./models/Airport');

// ── Seed principal ────────────────────────────────────────────────────────────
async function runSeed() {
  const count = await Airport.countDocuments();

  if (count > 0) {
    console.log(`INFO: Seed omitido: ya existen ${count} aeropuertos en MongoDB.`);
    return;
  }

  const jsonPath = path.resolve('/app/airports.json');

  if (!fs.existsSync(jsonPath)) {
    console.warn('WARNING: No se encontró airports.json en /app/airports.json — seed omitido.');
    return;
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');

  let airports;
  try {
    airports = JSON.parse(raw);
  } catch (_err) {
    const fixed = '[' + raw.trim().replace(/\}\s*\{/g, '},{') + ']';
    airports = JSON.parse(fixed);
    console.log('INFO: airports.json parseado como objetos JSON concatenados.');
  }

  if (!Array.isArray(airports) || airports.length === 0) {
    console.warn('WARNING: airports.json está vacío o tiene formato incorrecto.');
    return;
  }

  console.log(`Cargando ${airports.length} aeropuertos...`);

  let insertados = 0;
  let errores = 0;

  for (const ap of airports) {
    const iata = ap.iata_faa
    const lat = parseFloat(ap.lat);
    const lng = parseFloat(ap.lng);
    const name = ap.name;


    try {
      // Guardar en MongoDB
      await Airport.create({
        name,
        city: ap.city || '',
        iata_faa: iata.toUpperCase(),
        icao: ap.icao || '',
        lat,
        lng,
        alt: ap.alt !== undefined ? parseInt(ap.alt, 10) : undefined,
        tz: ap.tz || '',
      });

      // Agregar a Redis GEO: GEOADD airports-geo <lng> <lat> <iata>
      await redisGeo.geoadd('airports-geo', lng, lat, iata.toUpperCase());

      insertados++;
    } catch (err) {
      if (err.code !== 11000) {
        console.error(`ERROR: con ${iata}:`, err.message);
      }
      errores++;
    }
  }

  // Inicializar ZSET de popularidad con TTL de 1 día
  const exists = await redisPop.exists('airport_popularity');
  if (!exists) {
    await redisPop.zadd('airport_popularity', 0, '__init__');
    await redisPop.zrem('airport_popularity', '__init__');
    await redisPop.expire('airport_popularity', 86400);
    console.log('ZSET airport_popularity inicializado con TTL de 1 día.');
  }

  console.log(`Seed completado: ${insertados} insertados, ${errores} omitidos.`);
}

module.exports = runSeed;