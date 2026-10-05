import { useEffect, useState } from 'react';
import { supabase, type TripLog, type UsageSnapshot } from '../lib/supabaseClient';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// A liberação é identificada como em trip_logs: veículo + condutor + released_at.
function tripKey(vehicleId: string, driverCode: string, releasedAt: string) {
  return `${vehicleId}|${driverCode}|${new Date(releasedAt).getTime()}`;
}

export function TripLogsPanel() {
  const [logs, setLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [usage, setUsage] = useState<Map<string, UsageSnapshot>>(new Map());

  useEffect(() => {
    // Embeds via FK: drivers(full_name) e vehicles(plate, model) — assim a
    // tabela mostra nome do motorista e dados do carro, não só os códigos.
    let query = supabase
      .from('trip_logs')
      .select('*, drivers(full_name), vehicles(plate, model)')
      .order('released_at', { ascending: false })
      .limit(200);
    if (vehicleFilter.trim()) query = query.ilike('vehicle_id', `%${vehicleFilter.trim()}%`);

    // Saldo de uso reportado pelo app (mais recente por liberação).
    supabase
      .from('usage_snapshots')
      .select('vehicle_id, driver_code, released_at, state, remaining_seconds, reported_at')
      .order('reported_at', { ascending: false })
      .limit(5000)
      .then(({ data }) => {
        const latest = new Map<string, UsageSnapshot>();
        for (const s of (data ?? []) as UsageSnapshot[]) {
          const k = tripKey(s.vehicle_id, s.driver_code, s.released_at);
          if (!latest.has(k)) latest.set(k, s); // já vem da mais nova para a mais antiga
        }
        setUsage(latest);
      });

    setLoading(true);
    query.then(({ data, error }) => {
      if (error) setError(error.message);
      else setLogs((data ?? []) as unknown as TripLog[]);
      setLoading(false);
    });
  }, [vehicleFilter]);


  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Logs de Viagem</h2>
          <p className="panel-sub">Sincronizados do app do motorista (offline-first) — somente leitura. O tempo liberado é um saldo de USO: só desconta com a partida ligada. O consumo é reportado pelo app quando o motorista conecta ao veículo, então reflete a última leitura, não necessariamente este instante.</p>
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
              <th>Saldo liberado</th>
              <th>Uso consumido</th>
              <th>Restante</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const snap = usage.get(tripKey(log.vehicle_id, log.driver_code, log.released_at));
              const grantedSec = log.valid_hours * 3600;
              const remaining = snap ? Math.min(snap.remaining_seconds, grantedSec) : null;
              const used = remaining === null ? null : grantedSec - remaining;
              const situation = !snap
                ? { label: 'sem leitura', cls: 'pill-off' }
                : snap.remaining_seconds === 0
                  ? { label: 'esgotado', cls: 'pill-off' }
                  : snap.state === 'UNLOCKED'
                    ? { label: 'ligado', cls: 'pill-ok' }
                    : { label: 'desligado', cls: 'pill-off' };
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
                  <td className="num">{log.valid_hours}h</td>
                  <td className="num">{used === null ? '—' : formatDuration(used)}</td>
                  <td className="num">{remaining === null ? '—' : formatDuration(remaining)}</td>
                  <td>
                    <span className={`pill ${situation.cls}`}>{situation.label}</span>
                    {snap && (
                      <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>lido {formatDate(snap.reported_at)}</div>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">Nenhum log sincronizado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
