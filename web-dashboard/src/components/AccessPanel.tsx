import { useEffect, useState } from 'react';
import { supabase, type Driver, type Vehicle } from '../lib/supabaseClient';

export function AccessPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [authorized, setAuthorized] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [d, v] = await Promise.all([
        supabase.from('drivers').select('*').order('full_name'),
        supabase.from('vehicles').select('*').order('vehicle_id'),
      ]);
      if (d.error) setError(d.error.message);
      else setDrivers((d.data ?? []) as Driver[]);
      if (v.error) setError(v.error.message);
      else setVehicles((v.data ?? []) as Vehicle[]);
      if (d.data && d.data.length > 0) setSelectedDriver(d.data[0].driver_code);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedDriver) { setAuthorized(new Set()); return; }
    supabase
      .from('driver_vehicle_access')
      .select('vehicle_id')
      .eq('driver_code', selectedDriver)
      .then(({ data, error }) => {
        if (error) { setError(error.message); return; }
        setAuthorized(new Set((data ?? []).map((r) => r.vehicle_id)));
      });
  }, [selectedDriver]);

  async function toggle(vehicleId: string, checked: boolean) {
    if (!selectedDriver) return;
    setError(null);
    if (checked) {
      const { error } = await supabase
        .from('driver_vehicle_access')
        .insert({ driver_code: selectedDriver, vehicle_id: vehicleId });
      if (error) { setError(error.message); return; }
      setAuthorized((prev) => new Set(prev).add(vehicleId));
    } else {
      const { error } = await supabase
        .from('driver_vehicle_access')
        .delete()
        .eq('driver_code', selectedDriver)
        .eq('vehicle_id', vehicleId);
      if (error) { setError(error.message); return; }
      setAuthorized((prev) => { const next = new Set(prev); next.delete(vehicleId); return next; });
    }
  }

  async function authorizeAll() {
    if (!selectedDriver) return;
    setBusy(true);
    setError(null);
    const missing = vehicles.filter((v) => !authorized.has(v.vehicle_id));
    if (missing.length > 0) {
      const { error } = await supabase
        .from('driver_vehicle_access')
        .insert(missing.map((v) => ({ driver_code: selectedDriver, vehicle_id: v.vehicle_id })));
      if (error) { setError(error.message); setBusy(false); return; }
    }
    setAuthorized(new Set(vehicles.map((v) => v.vehicle_id)));
    setBusy(false);
  }

  async function revokeAll() {
    if (!selectedDriver) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('driver_vehicle_access').delete().eq('driver_code', selectedDriver);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setAuthorized(new Set());
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Autorizações</h2>
          <p className="panel-sub">
            Quais veículos cada motorista pode operar. Sem nenhuma autorização marcada, o motorista pode operar
            qualquer veículo (comportamento atual do app/firmware — ver observação abaixo).
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : drivers.length === 0 ? (
        <p className="muted">Cadastre um condutor primeiro, na aba Condutores.</p>
      ) : (
        <>
          <div className="inline-form" style={{ alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
              <span className="muted" style={{ padding: 0, whiteSpace: 'nowrap' }}>Condutor:</span>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                style={{ flex: 1, padding: '9px 11px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
              >
                {drivers.map((d) => (
                  <option key={d.driver_code} value={d.driver_code}>{d.full_name} ({d.driver_code})</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={authorizeAll} disabled={busy}>Autorizar para todos os veículos</button>
            <button type="button" className="ghost" onClick={revokeAll} disabled={busy}>Remover todas</button>
          </div>

          <p className="muted" style={{ padding: 0, textAlign: 'left', marginBottom: 12 }}>
            {authorized.size} de {vehicles.length} veículo(s) autorizado(s) para este condutor.
          </p>

          <table>
            <thead>
              <tr>
                <th>Autorizado</th>
                <th>VEHICLE_ID</th>
                <th>Placa</th>
                <th>Modelo</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={authorized.has(v.vehicle_id)}
                      onChange={(e) => toggle(v.vehicle_id, e.target.checked)}
                    />
                  </td>
                  <td className="mono">{v.vehicle_id}</td>
                  <td>{v.plate ?? '—'}</td>
                  <td>{v.model ?? '—'}</td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">Nenhum veículo cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="spec-note" style={{ marginTop: 16 }}>
            <b>Nota:</b> esta tela organiza a relação motorista↔veículo para gestão e relatórios. A aplicação real
            no momento da liberação (o ESP32 recusar um motorista não autorizado) depende do firmware, que ainda
            não consulta esta tabela — está no plano de trabalho combinado para quando o firmware voltar ao escopo.
          </p>
        </>
      )}
    </section>
  );
}
