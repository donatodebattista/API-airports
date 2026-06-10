/* ═══════════════════════════════════════════════════════════════════════════
   SkyMap — App Logic
   ═══════════════════════════════════════════════════════════════════════════ */

const API = '/api';

// ── State ─────────────────────────────────────────────────────────────────────
let map;
let clusterGroup;
let nearbyLayer;       // capa para resultados nearby
let nearbyCircle;      // círculo de radio
let clickMarker;       // marker del punto clickeado en el mapa
let allAirports = [];  // cache de aeropuertos

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSidebar();
  initNearby();
  initPopular();
  initCreateModal();
  loadAllAirports();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MAPA
// ═══════════════════════════════════════════════════════════════════════════════

function initMap() {
  //const bounds = L.latLngBounds([-90, -180], [90, 180]).pad(0.15);

  map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: true,
    // maxBounds: bounds,
    // maxBoundsViscosity: 1.0
  });

  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // Tile layer - CartoDB Dark Matter (dark theme)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  // Cluster group
  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 12,
    chunkedLoading: true,
    chunkInterval: 100,
    chunkDelay: 20,
  });
  map.addLayer(clusterGroup);

  // Capa para resultados nearby
  nearbyLayer = L.layerGroup().addTo(map);

  // Click en el mapa → seleccionar punto para búsqueda nearby
  map.on('click', onMapClick);
}

// ── Crear marker personalizado ────────────────────────────────────────────────
function createAirportMarker(airport) {
  const icon = L.divIcon({
    className: '',
    html: '<div class="custom-marker"><div class="custom-marker-inner"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });

  const marker = L.marker([airport.lat, airport.lng], { icon });
  marker.iata_code = airport.iata_faa;

  // Al hacer click: pedir datos al backend (esto cuenta como visita)
  marker.on('click', () => {
    marker.unbindPopup();
    marker.bindPopup(createLoadingPopup(), {
      maxWidth: 320,
      autoPan: true,
      autoPanPadding: L.point(20, 20),   // margen respecto al borde del mapa
    }).openPopup();
    fetchAirportDetail(airport.iata_faa, marker);
  });

  return marker;
}

// ── Crear marker para resultado nearby ────────────────────────────────────────
function createNearbyMarker(item) {
  const icon = L.divIcon({
    className: '',
    html: '<div class="custom-marker nearby-marker"><div class="custom-marker-inner"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });

  const marker = L.marker([item.lat, item.lng], { icon });
  marker.iata_code = item.iata_code;

  marker.on('click', () => {
    marker.unbindPopup();
    marker.bindPopup(createLoadingPopup(), { maxWidth: 320 }).openPopup();
    fetchAirportDetail(item.iata_code, marker);
  });

  return marker;
}

// ── Loading popup HTML ────────────────────────────────────────────────────────
function createLoadingPopup() {
  return `<div class="popup-content popup-loading">
    <div class="spinner"></div>
    Cargando datos…
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CREAR AEROPUERTO
// ═══════════════════════════════════════════════════════════════════════════════

function initCreateModal() {
  const overlay = document.getElementById('modal-create');
  const btnOpen = document.getElementById('btn-open-create');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const btnConfirm = document.getElementById('btn-confirm-create');

  const openModal = () => {
    overlay.classList.remove('hidden');
    document.getElementById('new-iata').focus();
  };

  const closeModal = () => {
    overlay.classList.add('hidden');
    clearModalForm();
  };

  btnOpen.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  // Cerrar al hacer click fuera del modal
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
  });

  btnConfirm.addEventListener('click', createAirport);
}

function clearModalForm() {
  ['new-iata', 'new-icao', 'new-name', 'new-city',
    'new-lat', 'new-lng', 'new-alt', 'new-tz'].forEach(id => {
      document.getElementById(id).value = '';
    });
}

// El click en el mapa ya llena lat/lng en el nearby form;
// si el modal está abierto, los autocompleta también
function onMapClick(e) {
  const { lat, lng } = e.latlng;

  // Nearby
  document.getElementById('input-lat').value = lat.toFixed(5);
  document.getElementById('input-lng').value = lng.toFixed(5);

  // Modal de creación (si está abierto)
  const modal = document.getElementById('modal-create');
  if (!modal.classList.contains('hidden')) {
    document.getElementById('new-lat').value = lat.toFixed(5);
    document.getElementById('new-lng').value = lng.toFixed(5);
  }

  // Marker visual
  if (clickMarker) map.removeLayer(clickMarker);
  const icon = L.divIcon({
    className: '',
    html: '<div class="click-marker"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  clickMarker = L.marker([lat, lng], { icon }).addTo(map);
}

async function createAirport() {
  const iata = document.getElementById('new-iata').value.trim().toUpperCase();
  const name = document.getElementById('new-name').value.trim();
  const lat = parseFloat(document.getElementById('new-lat').value);
  const lng = parseFloat(document.getElementById('new-lng').value);

  // Validación mínima (campos obligatorios según el schema)
  if (!iata || !name || isNaN(lat) || isNaN(lng)) {
    showToast('Completá los campos obligatorios: IATA, Nombre, Latitud y Longitud', 'error');
    return;
  }

  if (iata.length < 2 || iata.length > 4) {
    showToast('El código IATA debe tener entre 2 y 4 caracteres', 'error');
    return;
  }

  const btnConfirm = document.getElementById('btn-confirm-create');
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Creando…';

  const body = {
    iata_faa: iata,
    name,
    lat,
    lng,
    city: document.getElementById('new-city').value.trim() || undefined,
    icao: document.getElementById('new-icao').value.trim().toUpperCase() || undefined,
    alt: document.getElementById('new-alt').value !== ''
      ? parseInt(document.getElementById('new-alt').value, 10)
      : undefined,
    tz: document.getElementById('new-tz').value.trim() || undefined,
  };

  // Limpiar undefined para no enviarlos en el JSON
  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

  try {
    const res = await fetch(`${API}/airports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error al crear el aeropuerto');
    }

    // Agregar al estado local y al mapa
    allAirports.push(data);
    const marker = createAirportMarker(data);
    clusterGroup.addLayer(marker);

    // Actualizar estadísticas
    updateStat('stat-total', allAirports.length.toLocaleString());
    updateStat('stat-visible', allAirports.length.toLocaleString());

    // Volar al nuevo aeropuerto
    map.flyTo([data.lat, data.lng], 10, { duration: 1.2 });

    showToast(`Aeropuerto ${data.iata_faa} creado correctamente`, 'success');

    document.getElementById('modal-create').classList.add('hidden');
    clearModalForm();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-svg">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      Crear Aeropuerto`;
  }
}

// ── Fetch detalle de aeropuerto ───────────────────────────────────────────────
async function fetchAirportDetail(iataCode, marker) {
  try {
    const res = await fetch(`${API}/airports/${iataCode}`);
    if (!res.ok) throw new Error('Aeropuerto no encontrado');
    const ap = await res.json();

    const popupHtml = `
      <div class="popup-content">
        <div class="popup-header">
          <div>
            <div class="popup-iata">${ap.iata_faa}</div>
          </div>
          <div>
            <div class="popup-name">${ap.name}</div>
            <div class="popup-city">${ap.city || '—'}</div>
          </div>
        </div>
        <div class="popup-details">
          <div class="popup-detail">
            <span class="popup-detail-label">ICAO</span>
            <span class="popup-detail-value">${ap.icao || '—'}</span>
          </div>
          <div class="popup-detail">
            <span class="popup-detail-label">Altitud</span>
            <span class="popup-detail-value">${ap.alt != null ? ap.alt + ' ft' : '—'}</span>
          </div>
          <div class="popup-detail">
            <span class="popup-detail-label">Latitud</span>
            <span class="popup-detail-value">${ap.lat.toFixed(4)}</span>
          </div>
          <div class="popup-detail">
            <span class="popup-detail-label">Longitud</span>
            <span class="popup-detail-value">${ap.lng.toFixed(4)}</span>
          </div>
          <div class="popup-detail" style="grid-column: span 2">
            <span class="popup-detail-label">Zona horaria</span>
            <span class="popup-detail-value">${ap.tz || '—'}</span>
          </div>
        </div>
        <div class="popup-actions" style="margin-top: var(--space-md);">
          <button class="btn btn-danger btn-sm" onclick="deleteAirport('${ap.iata_faa}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-svg">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Eliminar Aeropuerto
          </button>
        </div>
      </div>`;

    marker.setPopupContent(popupHtml);
    if (marker.isPopupOpen()) {
      marker.getPopup().update();   // recalcula posición y dispara autoPan
    }
  } catch (err) {
    marker.setPopupContent(`<div class="popup-content popup-loading">Error al cargar datos</div>`);
    showToast('No se pudo cargar el aeropuerto', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CARGA DE AEROPUERTOS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadAllAirports() {
  try {
    const res = await fetch(`${API}/airports`);
    if (!res.ok) throw new Error('Error al obtener aeropuertos');
    allAirports = await res.json();

    // Stats
    updateStat('stat-total', allAirports.length.toLocaleString());
    updateStat('stat-visible', allAirports.length.toLocaleString());

    // Agregar al cluster
    const markers = [];
    for (const ap of allAirports) {
      if (ap.lat && ap.lng && ap.iata_faa) {
        markers.push(createAirportMarker(ap));
      }
    }
    clusterGroup.addLayers(markers);

    showToast(`${allAirports.length.toLocaleString()} aeropuertos cargados`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al cargar aeropuertos', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btnOpen = document.getElementById('btn-toggle-sidebar');
  const btnClose = document.getElementById('btn-close-sidebar');

  function open() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }

  function close() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }

  btnOpen.addEventListener('click', open);
  btnClose.addEventListener('click', close);
  overlay.addEventListener('click', close);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NEARBY SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

function initNearby() {
  const btnSearch = document.getElementById('btn-search-nearby');
  btnSearch.addEventListener('click', searchNearby);
}

function onMapClick(e) {
  const { lat, lng } = e.latlng;
  document.getElementById('input-lat').value = lat.toFixed(5);
  document.getElementById('input-lng').value = lng.toFixed(5);

  // Marker visual del punto clickeado
  if (clickMarker) map.removeLayer(clickMarker);
  const icon = L.divIcon({
    className: '',
    html: '<div class="click-marker"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  clickMarker = L.marker([lat, lng], { icon }).addTo(map);
}

async function searchNearby() {
  const lat = parseFloat(document.getElementById('input-lat').value);
  const lng = parseFloat(document.getElementById('input-lng').value);
  const radius = parseFloat(document.getElementById('input-radius').value);

  if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
    showToast('Completá latitud, longitud y radio', 'error');
    return;
  }

  const container = document.getElementById('nearby-results');
  container.classList.remove('hidden');
  container.innerHTML = `<div class="results-loading"><div class="spinner"></div> Buscando…</div>`;

  try {
    const res = await fetch(`${API}/airports/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    if (!res.ok) throw new Error('Error en búsqueda');
    const results = await res.json();

    // Limpiar capa de resultados previos
    nearbyLayer.clearLayers();
    if (nearbyCircle) map.removeLayer(nearbyCircle);

    // Dibujar el círculo de radio
    nearbyCircle = L.circle([lat, lng], {
      radius: radius * 1000,
      className: 'nearby-circle',
    }).addTo(nearbyLayer);

    if (results.length === 0) {
      container.innerHTML = '<div class="results-empty">No se encontraron aeropuertos en ese radio.</div>';
      map.flyTo([lat, lng], 6, { duration: 1.2 });
      return;
    }

    // Agregar markers de resultados
    results.forEach(item => {
      nearbyLayer.addLayer(createNearbyMarker(item));
    });

    // Zoom al área de resultados
    map.flyToBounds(nearbyCircle.getBounds().pad(0.15), { duration: 1.2 });

    // Renderizar lista
    container.innerHTML = results.map((item, i) => `
      <div class="result-item" data-lat="${item.lat}" data-lng="${item.lng}" data-iata="${item.iata_code}">
        <div class="result-rank rank-default">${i + 1}</div>
        <div class="result-info">
          <div class="result-iata">${item.iata_code}</div>
        </div>
        <div class="result-badge">${item.distance_km.toFixed(1)} km</div>
      </div>
    `).join('');

    // Click en item → centrar mapa
    container.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const rlat = parseFloat(el.dataset.lat);
        const rlng = parseFloat(el.dataset.lng);
        map.flyTo([rlat, rlng], 12, { duration: 1 });
      });
    });

    showToast(`${results.length} aeropuerto(s) encontrado(s)`, 'success');
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="results-empty">Error al buscar aeropuertos cercanos.</div>';
    showToast('Error en búsqueda nearby', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POPULAR AIRPORTS
// ═══════════════════════════════════════════════════════════════════════════════

function initPopular() {
  const btn = document.getElementById('btn-load-popular');
  btn.addEventListener('click', loadPopular);
}

async function loadPopular() {
  const container = document.getElementById('popular-results');
  container.classList.remove('hidden');
  container.innerHTML = `<div class="results-loading"><div class="spinner"></div> Cargando ranking…</div>`;

  try {
    const res = await fetch(`${API}/airports/popular`);
    if (!res.ok) throw new Error('Error al cargar ranking');
    const results = await res.json();

    if (results.length === 0) {
      container.innerHTML = '<div class="results-empty">Todavía no hay visitas registradas.</div>';
      return;
    }

    container.innerHTML = results.map((item, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
      return `
        <div class="result-item" data-iata="${item.iata_code}">
          <div class="result-rank ${rankClass}">${i + 1}</div>
          <div class="result-info">
            <div class="result-iata">${item.iata_code}</div>
          </div>
          <div class="result-badge">${item.visits} visita${item.visits !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');

    // Click en item → buscar en el mapa y centrar
    container.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const iata = el.dataset.iata;
        const ap = allAirports.find(a => a.iata_faa === iata);
        if (ap) {
          map.flyTo([ap.lat, ap.lng], 10, { duration: 1 });
        }
      });
    });

    showToast('Ranking actualizado', 'info');
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="results-empty">Error al cargar el ranking.</div>';
    showToast('Error al cargar ranking', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

function updateStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.querySelector('.stat-value').textContent = value;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3500);
}

// ── Eliminar Aeropuerto ───────────────────────────────────────────────────────
async function deleteAirport(iataCode) {
  if (!confirm(`¿Estás seguro de que deseas eliminar el aeropuerto ${iataCode}?`)) {
    return;
  }

  try {
    const res = await fetch(`${API}/airports/${iataCode}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al eliminar el aeropuerto');
    }

    showToast(`Aeropuerto ${iataCode} eliminado correctamente`, 'success');

    // 1. Cerrar popup actual
    map.closePopup();

    // 2. Eliminar marker de clusterGroup
    clusterGroup.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.iata_code === iataCode) {
        clusterGroup.removeLayer(layer);
      }
    });

    // 3. Eliminar marker de nearbyLayer
    nearbyLayer.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.iata_code === iataCode) {
        nearbyLayer.removeLayer(layer);
      }
    });

    // 4. Actualizar array local de aeropuertos
    allAirports = allAirports.filter(ap => ap.iata_faa !== iataCode);

    // 5. Actualizar estadísticas
    updateStat('stat-total', allAirports.length.toLocaleString());
    updateStat('stat-visible', allAirports.length.toLocaleString());

    // 6. Si estaba en los resultados de nearby en el sidebar, quitarlo o actualizar
    const nearbyResults = document.getElementById('nearby-results');
    if (nearbyResults) {
      const nearbyItem = nearbyResults.querySelector(`[data-iata="${iataCode}"]`);
      if (nearbyItem) {
        nearbyItem.remove();
        if (nearbyResults.querySelectorAll('.result-item').length === 0) {
          nearbyResults.innerHTML = '<div class="results-empty">No se encontraron aeropuertos en ese radio.</div>';
        }
      }
    }

    // 7. Si estaba en los resultados de más visitados (popular), quitarlo o actualizar
    const popularResults = document.getElementById('popular-results');
    if (popularResults) {
      const popularItem = popularResults.querySelector(`[data-iata="${iataCode}"]`);
      if (popularItem) {
        popularItem.remove();
        if (popularResults.querySelectorAll('.result-item').length === 0) {
          popularResults.innerHTML = '<div class="results-empty">Todavía no hay visitas registradas.</div>';
        } else {
          // Recargar el popular ranking si existía para reflejar los datos actualizados
          loadPopular();
        }
      }
    }

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Error al eliminar el aeropuerto', 'error');
  }
}

