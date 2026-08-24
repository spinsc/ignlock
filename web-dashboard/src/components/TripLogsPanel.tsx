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
    // Embeds via FK: drivers(full_name) e vehicles(plate, model) — assim a
    // tabela mostra nome do motorista e dados do carro, não só os códigos.
    let query = supabase
      .from('trip_logs')
      .select('*, drivers(full_name), vehicles(plate, model)')
      .order('released_at', { ascending: false })
      .limit(200);
    if (vehicleFilter.trim()) query = query.ilike('vehicle_id', `%${vehicleFilter.trim()}%`);

    setLoading(true);
    query.then(({ data, error }) => {
      if (error) setError(error.message);
      else setLogs((data ?? []) as unknown as TripLog[]);
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
              <th>Motorista</th>
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
              const vehicleExtra = [log.vehicles?.plate, log.vehicles?.model].filter(Boolean).join(' · ');
              return (
                <tr key={log.id}>
                  <td>
                    <span className="mono">{log.vehicle_id}</span>
                    {vehicleExtra && <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>{vehicleExtra}</div>}
                  </td>
                  <td>
                    <span>{log.drivers?.full_name ?? '—'}</span>
                    <div className="muted mono" style={{ padding: '2px 0 0', fontSize: 11 }}>{log.driver_code}</div>
                  </td>
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
