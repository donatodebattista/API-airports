const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String },
  iata_faa: { type: String, required: true, unique: true, uppercase: true },
  icao: { type: String },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  alt: { type: Number },
  tz: { type: String },
}, { timestamps: true });

const Airport = mongoose.models.Airport || mongoose.model('Airport', airportSchema);

module.exports = Airport;
