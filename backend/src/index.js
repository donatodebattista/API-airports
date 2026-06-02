const express = require('express');
const cors = require('cors');
const { connectMongo, redisGeo, redisPop } = require('./db');
const runSeed = require('./seed');
const airportsRouter = require('./routes/airports');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health-check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// router
app.use('/airports', airportsRouter);

// start
async function start() {
  try {
    await connectMongo();
    console.log('✅  MongoDB conectado');

    // Verificar Redis GEO
    await redisGeo.ping();
    console.log('✅  Redis GEO conectado');

    // Verificar Redis POP
    await redisPop.ping();
    console.log('✅  Redis POP conectado');

    // Carga inicial de datos (solo si la colección está vacía)
    await runSeed();

    app.listen(PORT, () => {
      console.log(`🚀  Backend escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌  Error al iniciar:', err.message);
    process.exit(1);
  }
}

start();
