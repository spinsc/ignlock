import { useEffect, useState } from 'react';
import { supabase, type Driver, type DriverPartner, type Vehicle } from '../lib/supabaseClient';

export function AccessPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [authorized, setAuthorized] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partners, setPartners] = useState<DriverPartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const [pVehicle, setPVehicle] = useState('');
  const [pOfficial, setPOfficial] = useState('');
  const [pPartner, setPPartner] = useState('');
  const [pBusy, setPBusy] = useState(false);

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
      if (v.data && v.data.length > 0) setPVehicle(v.data[0].vehicle_id);
      setLoading(false);
    })();
    loadPartners();
  }, []);

  function loadPartners() {
    setPartnersLoading(true);
    supabase
      .from('driver_partners')
      .select(
        'vehicle_id, official_driver_code, partner_driver_code, created_at,' +
          'official:drivers!driver_partners_official_driver_code_fkey(full_name),' +
          'partner:drivers!driver_partners_partner_driver_code_fkey(full_name),' +
          'vehicles(plate, model)'
      )
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setPartnersError(error.message);
        else setPartners((data ?? []) as unknown as DriverPartner[]);
        setPartnersLoading(false);
      });
  }

  async function addPartner() {
    if (!pVehicle || !pOfficial || !pPartner) return;
    if (pOfficial === pPartner) { setPartnersError('O parceiro precisa ser um condutor diferente do oficial.'); return; }
    setPBusy(true);
    setPartnersError(null);
    const { error } = await supabase
      .from('driver_partners')
      .insert({ vehicle_id: pVehicle, official_driver_code: pOfficial, partner_driver_code: pPartner });
    setPBusy(false);
    if (error) { setPartnersError(error.message); return; }
    loadPartners();
  }

  async function removePartner(p: DriverPartner) {
    setPartnersError(null);
    const { error } = await supabase
      .from('driver_partners')
      .delete()
      .eq('vehicle_id', p.vehicle_id)
      .eq('official_driver_code', p.official_driver_code)
      .eq('partner_driver_code', p.partner_driver_code);
    if (error) { setPartnersError(error.message); return; }
    setPartners((prev) => prev.filter((x) =>
      !(x.vehicle_id === p.vehicle_id && x.official_driver_code === p.official_driver_code && x.partner_driver_code === p.partner_driver_code)
    ));
  }

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

      <div className="panel-head" style={{ marginTop: 32 }}>
        <div>
          <h2>Motorista parceiro (opcional)</h2>
          <p className="panel-sub">
            Vincula um condutor parceiro a um condutor oficial, em um veículo específico. O parceiro fica
            autorizado a dar partida nesse veículo apenas na ausência do oficial — durante a posse dele
            (enquanto houver um log de viagem aberto do oficial para esse veículo, ver aba Logs de Viagem).
          </p>
        </div>
      </div>

      {partnersError && <p className="form-error">{partnersError}</p>}

      {drivers.length < 2 ? (
        <p className="muted">Cadastre pelo menos dois condutores para configurar um vínculo de parceiro.</p>
      ) : (
        <>
          <div className="inline-form" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ padding: 0, whiteSpace: 'nowrap' }}>Veículo:</span>
              <select
                value={pVehicle}
                onChange={(e) => setPVehicle(e.target.value)}
                style={{ padding: '9px 11px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
              >
                {vehicles.map((v) => <option key={v.id} value={v.vehicle_id}>{v.vehicle_id}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ padding: 0, whiteSpace: 'nowrap' }}>Oficial:</span>
              <select
                value={pOfficial}
                onChange={(e) => setPOfficial(e.target.value)}
                style={{ padding: '9px 11px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
              >
                <option value="">Selecione…</option>
                {drivers.map((d) => <option key={d.driver_code} value={d.driver_code}>{d.full_name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ padding: 0, whiteSpace: 'nowrap' }}>Parceiro:</span>
              <select
                value={pPartner}
                onChange={(e) => setPPartner(e.target.value)}
                style={{ padding: '9px 11px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
              >
                <option value="">Selecione…</option>
                {drivers.map((d) => <option key={d.driver_code} value={d.driver_code}>{d.full_name}</option>)}
              </select>
            </label>
            <button type="button" onClick={addPartner} disabled={pBusy || !pVehicle || !pOfficial || !pPartner}>
              Vincular
            </button>
          </div>

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Oficial</th>
                <th>Parceiro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {partnersLoading ? (
                <tr><td colSpan={4} className="muted">Carregando…</td></tr>
              ) : partners.length === 0 ? (
                <tr><td colSpan={4} className="muted">Nenhum vínculo de parceiro cadastrado.</td></tr>
              ) : (
                partners.map((p) => (
                  <tr key={`${p.vehicle_id}-${p.official_driver_code}-${p.partner_driver_code}`}>
                    <td>
                      <span className="mono">{p.vehicle_id}</span>
                      {(p.vehicles?.plate || p.vehicles?.model) && (
                        <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>
                          {[p.vehicles?.plate, p.vehicles?.model].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>{p.official?.full_name ?? p.official_driver_code}</td>
                    <td>{p.partner?.full_name ?? p.partner_driver_code}</td>
                    <td>
                      <button type="button" className="ghost" onClick={() => removePartner(p)}>Remover</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
