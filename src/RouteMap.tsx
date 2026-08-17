

import { useState, useRef, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import type { LatLngExpression, Map } from 'leaflet';
import L from 'leaflet';
import {
  FaMagnifyingGlass,
  FaPlus,
  FaMinus,
  FaSpinner,
  FaRoute,
  FaTrash,
  FaCrosshairs,
} from 'react-icons/fa6';
import 'leaflet/dist/leaflet.css';

// ------------------------------------------------------------
// 1. TYPES
// ------------------------------------------------------------
interface MarkerData {
  lat: number;
  lng: number;
  title: string;
  desc: string;
}

interface SearchResult {
  lat: number;
  lng: number;
  displayName: string;
}

// ------------------------------------------------------------
// 2. CUSTOM MARKER ICONS
// ------------------------------------------------------------
const defaultIcon = L.divIcon({
  html: `
    <div class="bg-blue-600 w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center transform -rotate-45">
      <i class="fa-solid fa-map-pin text-white text-sm transform rotate-45"></i>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

const startIcon = L.divIcon({
  html: `
    <div class="bg-green-500 w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center transform -rotate-45">
      <i class="fa-solid fa-location-dot text-white text-base transform rotate-45"></i>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

const endIcon = L.divIcon({
  html: `
    <div class="bg-red-500 w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center transform -rotate-45">
      <i class="fa-solid fa-flag-checkered text-white text-sm transform rotate-45"></i>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

// ------------------------------------------------------------
// 3. HELPERS
// ------------------------------------------------------------
async function searchLocation(query: string): Promise<SearchResult | null> {
  if (!query.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MapComponent/1.0' },
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name || result.name || query,
    };
  } catch {
    return null;
  }
}

async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    const coords = data.routes[0].geometry.coordinates;
    return coords.map((coord: [number, number]) => [coord[1], coord[0]]);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// 4. ZOOM CONTROLS
// ------------------------------------------------------------
function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <button
        onClick={() => map.zoomIn()}
        className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-t-xl shadow-lg hover:bg-gray-100 transition-all duration-200 flex items-center justify-center text-gray-700 hover:scale-105"
        title="ज़ूम इन करें"
      >
        <FaPlus className="text-lg" />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-b-xl shadow-lg hover:bg-gray-100 transition-all duration-200 flex items-center justify-center text-gray-700 hover:scale-105 border-t border-gray-200"
        title="ज़ूम आउट करें"
      >
        <FaMinus className="text-lg" />
      </button>
    </div>
  );
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (event: L.LeafletMouseEvent) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const handleClick = (event: L.LeafletMouseEvent) => {
      onMapClick(event);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onMapClick]);

  return null;
}

// ------------------------------------------------------------
// 5. MAIN COMPONENT
// ------------------------------------------------------------
export default function GoogleMap() {
  // ---- State ----
  const [marker, setMarker] = useState<MarkerData | null>(null);
  const [searchInput, setSearchInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [fromInput, setFromInput] = useState<string>('');
  const [toInput, setToInput] = useState<string>('');
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [routeMarkers, setRouteMarkers] = useState<{
    start: MarkerData | null;
    end: MarkerData | null;
  }>({ start: null, end: null });
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);

  const mapRef = useRef<Map | null>(null);

  // ---- Functions ----
  const updateMarker = (lat: number, lng: number, title: string, desc: string) => {
    setMarker({ lat, lng, title, desc });
    setRouteMarkers({ start: null, end: null });
    setRoutePoints([]);
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 14, { duration: 1.2 });
    }
  };

  const clearRoute = () => {
    setRoutePoints([]);
    setRouteMarkers({ start: null, end: null });
    setFromInput('');
    setToInput('');
  };

  const handleRouteSubmit = async () => {
    if (!fromInput.trim() || !toInput.trim()) {
      alert('कृपया दोनों जगहें भरें।');
      return;
    }
    setRouteLoading(true);
    const fromResult = await searchLocation(fromInput);
    const toResult = await searchLocation(toInput);
    if (!fromResult || !toResult) {
      alert('❌ एक या दोनों जगहें नहीं मिलीं। कृपया सही नाम डालें।');
      setRouteLoading(false);
      return;
    }
    const route = await fetchRoute(
      { lat: fromResult.lat, lng: fromResult.lng },
      { lat: toResult.lat, lng: toResult.lng }
    );
    if (!route || route.length === 0) {
      alert('❌ रूट नहीं मिला। कृपया दूसरी जगहें आज़माएँ।');
      setRouteLoading(false);
      return;
    }
    setRoutePoints(route);
    setRouteMarkers({
      start: {
        lat: fromResult.lat,
        lng: fromResult.lng,
        title: '🚀 शुरू',
        desc: fromResult.displayName,
      },
      end: {
        lat: toResult.lat,
        lng: toResult.lng,
        title: '🏁 गंतव्य',
        desc: toResult.displayName,
      },
    });
    setMarker(null);
    if (mapRef.current) {
      const bounds = L.latLngBounds(route);
      mapRef.current.fitBounds(bounds, { padding: [50, 50], duration: 1.2 });
    }
    setRouteLoading(false);
  };

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    const result = await searchLocation(searchInput);
    if (result) {
      const shortName = result.displayName.split(',').slice(0, 3).join(', ');
      updateMarker(result.lat, result.lng, '📍 ' + shortName, result.displayName);
      setSearchInput(shortName);
      clearRoute();
    } else {
      alert('❌ जगह नहीं मिली। कृपया दोबारा कोशिश करें।');
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      alert('⚠️ आपका ब्राउज़र लोकेशन सपोर्ट नहीं करता।');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        updateMarker(
          latitude,
          longitude,
          '📍 मेरी लोकेशन',
          `अक्षांश: ${latitude.toFixed(5)}, देशांतर: ${longitude.toFixed(5)}`
        );
        setLocating(false);
        clearRoute();
      },
      (err) => {
        let msg = '⚠️ लोकेशन नहीं मिल पाई। ';
        if (err.code === 1) msg += 'कृपया लोकेशन परमिशन दें।';
        else if (err.code === 2) msg += 'लोकेशन अनुपलब्ध है।';
        else msg += 'कृपया फिर से कोशिश करें।';
        alert(msg);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;
    updateMarker(
      lat,
      lng,
      '📍 मैन्युअल मार्कर',
      `लैट: ${lat.toFixed(5)}, लॉन्ग: ${lng.toFixed(5)}`
    );
    setSearchInput(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    clearRoute();
  };

  useEffect(() => {
    updateMarker(28.6129, 77.2295, '🇮🇳 India Gate', 'New Delhi, India');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // ---- Render ----
  return (
    <div className="flex w-full h-screen max-h-screen bg-gray-100 font-sans m-0 p-0 overflow-hidden">
      {/* ---- LEFT PANEL (NO MARGIN/PADDING ON OUTER) ---- */}
      <div className="w-80 min-w-[280px] bg-white shadow-2xl flex flex-col h-full overflow-y-auto p-5 gap-4 z-10">
        {/* Header */}
        <div className="pb-2 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-2xl">🗺️</span> मैप नेविगेशन
          </h2>
          <p className="text-xs text-gray-500 mt-1">खोजें, रूट बनाएँ, और नेविगेट करें</p>
        </div>

        {/* Single search */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <FaMagnifyingGlass className="text-blue-500" /> जगह खोजें
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="जगह का नाम…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <FaMagnifyingGlass />
            </button>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Route section */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <FaRoute className="text-green-600" /> रूट प्लान करें
          </label>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full min-w-[50px] text-center">From</span>
              <input
                type="text"
                placeholder="शुरू की जगह"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRouteSubmit()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full min-w-[50px] text-center">To</span>
              <input
                type="text"
                placeholder="गंतव्य"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRouteSubmit()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleRouteSubmit}
              disabled={routeLoading}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {routeLoading ? <FaSpinner className="animate-spin" /> : <FaRoute />}
              <span>{routeLoading ? 'लोड हो रहा…' : 'रूट दिखाएँ'}</span>
            </button>
            {(routePoints.length > 0 || routeMarkers.start || routeMarkers.end) && (
              <button
                onClick={clearRoute}
                className="bg-red-500 text-white px-4 py-2.5 rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                title="रूट हटाएँ"
              >
                <FaTrash />
              </button>
            )}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Location button */}
        <div>
          <button
            onClick={handleLocate}
            disabled={locating}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg py-2.5 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {locating ? <FaSpinner className="animate-spin" /> : <FaCrosshairs />}
            <span>{locating ? 'लोकेशन ढूँढ रहा…' : 'मेरी लोकेशन'}</span>
          </button>
        </div>
      </div>

      {/* ---- RIGHT PANEL (MAP) - NO MARGIN/PADDING ---- */}
      <div className="flex-1 relative bg-gray-200">
        {/* Loader */}
        {loading && (
          <div className="absolute inset-0 z-[999] bg-gray-100 flex flex-col items-center justify-center gap-3 transition-opacity duration-500">
            <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-600 font-medium">🌍 मानचित्र लोड हो रहा है…</p>
          </div>
        )}

        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          zoomControl={false}
          ref={mapRef}
          whenReady={() => setLoading(false)}
          className="w-full h-full z-0"
        >
          <MapClickHandler onMapClick={handleMapClick} />

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© OpenStreetMap contributors'
            maxZoom={19}
          />

          {marker && !routeMarkers.start && !routeMarkers.end && (
            <Marker position={[marker.lat, marker.lng] as LatLngExpression} icon={defaultIcon}>
              <Popup className="custom-popup">
                <div className="font-bold text-gray-800">{marker.title}</div>
                <div className="text-gray-500 text-sm">{marker.desc}</div>
              </Popup>
            </Marker>
          )}

          {routeMarkers.start && (
            <Marker position={[routeMarkers.start.lat, routeMarkers.start.lng] as LatLngExpression} icon={startIcon}>
              <Popup className="custom-popup">
                <div className="font-bold text-gray-800">{routeMarkers.start.title}</div>
                <div className="text-gray-500 text-sm">{routeMarkers.start.desc}</div>
              </Popup>
            </Marker>
          )}

          {routeMarkers.end && (
            <Marker position={[routeMarkers.end.lat, routeMarkers.end.lng] as LatLngExpression} icon={endIcon}>
              <Popup className="custom-popup">
                <div className="font-bold text-gray-800">{routeMarkers.end.title}</div>
                <div className="text-gray-500 text-sm">{routeMarkers.end.desc}</div>
              </Popup>
            </Marker>
          )}

          {routePoints.length > 0 && (
            <Polyline
              positions={routePoints as LatLngExpression[]}
              color="#2563eb"
              weight={5}
              opacity={0.8}
              smoothFactor={1}
            />
          )}

          <ZoomControls />
        </MapContainer>
      </div>

      {/* ===== Minimal custom CSS for Leaflet overrides & animations ===== */}
      <style>{`
        /* Leaflet popup customisation */
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 14px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.18);
          padding: 4px 0;
        }
        .custom-popup .leaflet-popup-content {
          font-size: 14px;
          padding: 8px 14px;
          min-width: 160px;
        }
        /* Ensure map container takes full height */
        .leaflet-container {
          height: 100%;
          width: 100%;
        }
        /* Hide leaflet attribution if needed (optional) */
        .leaflet-control-attribution {
          font-size: 10px;
          background: rgba(255,255,255,0.7);
          backdrop-filter: blur(4px);
          border-radius: 6px;
          padding: 2px 8px;
        }
      `}</style>
    </div>
  );
}