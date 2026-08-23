import { useEffect, useState } from 'react';
import { supabase, type TripLog } from '../lib/supabaseClient';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

export function TripLogsPanel() {
  const [logs, setLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState('');

  useEffect(() => {
    let query = supabase.from('trip_logs').select('*').order('released_at', { ascending: false }).limit(200);
    if (vehicleFilter.trim()) query = query.ilike('vehicle_id', `%${vehicleFilter.trim()}%`);

    setLoading(true);
    query.then(({ data, error }) => {
      if (error) setError(error.message);
      else setLogs(data ?? []);
      setLoading(false);
    });
  }, [vehicleFilter]);

  const now = Date.now();

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Logs de Viagem</h2>
          <p className="panel-sub">Sincronizados do app do motorista (offline-first) — somente leitura.</p>
        </div>
        <input
          className="filter-input"
          placeholder="Filtrar por VEHICLE_ID…"
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Veículo</th>
              <th>Condutor</th>
              <th>KM</th>
              <th>Destino</th>
              <th>Liberado em</th>
              <th>Expira em</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const expired = new Date(log.expires_at).getTime() < now;
              return (
                <tr key={log.id}>
                  <td className="mono">{log.vehicle_id}</td>
                  <td className="mono">{log.driver_code}</td>
                  <td className="num">{log.odometer_km.toLocaleString('pt-BR')}</td>
                  <td>{log.destination}</td>
                  <td>{formatDate(log.released_at)}</td>
                  <td>{formatDate(log.expires_at)}</td>
                  <td>
                    <span className={`pill ${expired ? 'pill-off' : 'pill-ok'}`}>
                      {expired ? 'expirado' : 'válido'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">Nenhum log sincronizado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
