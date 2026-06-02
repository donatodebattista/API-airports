const { Router } = require('express');
const Airport = require('../models/Airport');
const { redisGeo, redisPop } = require('../db');

const router = Router();

// Keys de Redis 
const GEO_KEY = 'airports-geo';
const POP_KEY = 'airport_popularity';
const POP_TTL = 86400; // 1 día


//  IMPORTANTE: las rutas con paths fijos (/nearby, /popular) deben ir ANTES de
//  la ruta con parámetro (/:iata_code), porque Express las matchea en orden.

// GET /airports/nearby?lat=..&lng=..&radius=.. 
router.get('/nearby', async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;

        if (!lat || !lng || !radius) {
            return res.status(400).json({
                error: 'Faltan parámetros: lat, lng, radius (en km) son obligatorios.',
            });
        }

        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const radiusNum = parseFloat(radius);

        if (isNaN(latNum) || isNaN(lngNum) || isNaN(radiusNum)) {
            return res.status(400).json({ error: 'lat, lng y radius deben ser numéricos.' });
        }

        // GEOSEARCH
        const results = await redisGeo.geosearch(
            GEO_KEY,
            'FROMLONLAT', lngNum, latNum,
            'BYRADIUS', radiusNum, 'km',
            'ASC',
            'WITHCOORD',
            'WITHDIST'
        );

        const airports = results.map((item) => ({
            iata_code: item[0],
            distance_km: parseFloat(item[1]),
            lng: parseFloat(item[2][0]),
            lat: parseFloat(item[2][1]),
        }));

        res.json(airports);
    } catch (err) {
        console.error('Error en /airports/nearby:', err.message);
        res.status(500).json({ error: 'Error interno al buscar aeropuertos cercanos.' });
    }
});

// GET /airports/popular
router.get('/popular', async (req, res) => {
    try {
        // ZRANGE airport_popularity 0 9 REV WITHSCORES  → top 10
        const raw = await redisPop.zrange(POP_KEY, 0, 9, 'REV', 'WITHSCORES');

        // devuelve array plano: [member1, score1, member2, score2, ...]
        const popular = [];
        for (let i = 0; i < raw.length; i += 2) {
            popular.push({
                iata_code: raw[i],
                visits: parseInt(raw[i + 1], 10),
            });
        }

        res.json(popular);
    } catch (err) {
        console.error('Error en /airports/popular:', err.message);
        res.status(500).json({ error: 'Error interno al obtener ranking de popularidad.' });
    }
});

//  POST /airports
router.post('/', async (req, res) => {
    try {
        const { name, iata_faa, lat, lng } = req.body;

        if (!name || !iata_faa || lat === undefined || lng === undefined) {
            return res.status(400).json({
                error: 'Campos obligatorios: name, iata_faa, lat, lng.',
            });
        }

        // Crear en MongoDB
        const airport = await Airport.create({
            name,
            city: req.body.city || '',
            iata_faa: iata_faa.toUpperCase(),
            icao: req.body.icao || '',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            alt: req.body.alt !== undefined ? parseInt(req.body.alt, 10) : undefined,
            tz: req.body.tz || '',
        });

        // Agregar a Redis GEO
        await redisGeo.geoadd(GEO_KEY, parseFloat(lng), parseFloat(lat), iata_faa.toUpperCase());

        res.status(201).json(airport);
    } catch (err) {
        // Duplicado en MongoDB (unique index en iata_faa)
        if (err.code === 11000) {
            return res.status(409).json({ error: `El aeropuerto ${req.body.iata_faa} ya existe.` });
        }
        console.error('Error en POST /airports:', err.message);
        res.status(500).json({ error: 'Error interno al crear aeropuerto.' });
    }
});

// GET /airports
router.get('/', async (_req, res) => {
    try {
        const airports = await Airport.find().lean();
        res.json(airports);
    } catch (err) {
        console.error('Error en GET /airports:', err.message);
        res.status(500).json({ error: 'Error interno al listar aeropuertos.' });
    }
});

// GET /airports/:iata_code
router.get('/:iata_code', async (req, res) => {
    try {
        const iata = req.params.iata_code.toUpperCase();

        const airport = await Airport.findOne({ iata_faa: iata }).lean();

        if (!airport) {
            return res.status(404).json({ error: `Aeropuerto ${iata} no encontrado.` });
        }

        // Sumar +1 en popularidad
        await redisPop.zincrby(POP_KEY, 1, iata);
        // Renovar TTL de 1 día
        await redisPop.expire(POP_KEY, POP_TTL);

        res.json(airport);
    } catch (err) {
        console.error('Error en GET /airports/:iata_code:', err.message);
        res.status(500).json({ error: 'Error interno al obtener aeropuerto.' });
    }
});

// PUT /airports/:iata_code
router.put('/:iata_code', async (req, res) => {
    try {
        const iata = req.params.iata_code.toUpperCase();

        const airport = await Airport.findOneAndUpdate(
            { iata_faa: iata },
            req.body,
            { new: true, runValidators: true }
        ).lean();

        if (!airport) {
            return res.status(404).json({ error: `Aeropuerto ${iata} no encontrado.` });
        }

        // Si se modificaron coordenadas se actualizan en Redis GEO
        if (req.body.lat !== undefined || req.body.lng !== undefined) {
            await redisGeo.geoadd(GEO_KEY, airport.lng, airport.lat, iata);
        }

        res.json(airport);
    } catch (err) {
        console.error('Error en PUT /airports/:iata_code:', err.message);
        res.status(500).json({ error: 'Error interno al actualizar aeropuerto.' });
    }
});

//  DELETE /airports/:iata_code
router.delete('/:iata_code', async (req, res) => {
    try {
        const iata = req.params.iata_code.toUpperCase();

        const airport = await Airport.findOneAndDelete({ iata_faa: iata });

        if (!airport) {
            return res.status(404).json({ error: `Aeropuerto ${iata} no encontrado.` });
        }

        // Eliminar de Redis GEO
        await redisGeo.zrem(GEO_KEY, iata);
        // Eliminar de Redis Popularidad
        await redisPop.zrem(POP_KEY, iata);

        res.json({ message: `Aeropuerto ${iata} eliminado correctamente.` });
    } catch (err) {
        console.error('Error en DELETE /airports/:iata_code:', err.message);
        res.status(500).json({ error: 'Error interno al eliminar aeropuerto.' });
    }
});

module.exports = router;