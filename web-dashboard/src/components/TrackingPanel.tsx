import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { supabase, type VehiclePosition } from '../lib/supabaseClient';

// Vite não resolve os ícones padrão do Leaflet automaticamente — aponta
// explicitamente para os assets importados acima.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const DEFAULT_CENTER: [number, number] = [-27.5954, -48.5480]; // Florianópolis, ajustar se preciso
const STALE_MINUTES = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function minutesAgo(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function TrackingPanel() {
  const [positions, setPositions] = useState<VehiclePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // Última posição de cada veículo: busca as mais recentes e fica só com
    // a primeira ocorrência de cada vehicle_id (já vem ordenado).
    const { data, error } = await supabase
      .from('vehicle_positions')
      .select('*, vehicles(plate, model)')
      .order('recorded_at', { ascending: false })
      .limit(500);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const latestByVehicle = new Map<string, VehiclePosition>();
    for (const p of (data ?? []) as unknown as VehiclePosition[]) {
      if (!latestByVehicle.has(p.vehicle_id)) latestByVehicle.set(p.vehicle_id, p);
    }
    setPositions(Array.from(latestByVehicle.values()));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // atualiza a cada 1 min
    return () => clearInterval(interval);
  }, []);

  const center: [number, number] = positions.length > 0
    ? [positions[0].latitude, positions[0].longitude]
    : DEFAULT_CENTER;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Rastreamento</h2>
          <p className="panel-sub">
            Última posição conhecida de cada veículo, reportada pelo módulo de rastreamento
            (GPS + celular, independente do celular do motorista). Ver docs/08-modulo-rastreamento.md.
          </p>
        </div>
        <button className="ghost" onClick={load}>Atualizar</button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : positions.length === 0 ? (
        <p className="muted">Nenhuma posição recebida ainda.</p>
      ) : (
        <>
          <div className="map-wrap">
            <MapContainer center={center} zoom={12} style={{ height: '420px', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {positions.map((p) => (
                <Marker key={p.vehicle_id} position={[p.latitude, p.longitude]}>
                  <Popup>
                    <strong>{p.vehicle_id}</strong>
                    {p.vehicles?.model && <> — {p.vehicles.model}</>}
                    <br />
                    {formatDate(p.recorded_at)}
                    {p.speed_kmh != null && <><br />{Math.round(p.speed_kmh)} km/h</>}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <table style={{ marginTop: 18 }}>
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Última posição</th>
                <th>Velocidade</th>
                <th>Coordenadas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const stale = minutesAgo(p.recorded_at) > STALE_MINUTES;
                return (
                  <tr key={p.vehicle_id}>
                    <td>
                      <span className="mono">{p.vehicle_id}</span>
                      {p.vehicles?.model && (
                        <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>{p.vehicles.model}</div>
                      )}
                    </td>
                    <td>{formatDate(p.recorded_at)}</td>
                    <td className="num">{p.speed_kmh != null ? `${Math.round(p.speed_kmh)} km/h` : '—'}</td>
                    <td className="mono">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</td>
                    <td>
                      <span className={`pill ${stale ? 'pill-off' : 'pill-ok'}`}>
                        {stale ? 'sem sinal recente' : 'atualizado'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
