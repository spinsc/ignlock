import { useEffect, useState, type FormEvent } from 'react';
import { supabase, type Vehicle } from '../lib/supabaseClient';

export function VehiclesPanel() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setVehicles(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      vehicle_id: String(form.get('vehicle_id')).trim(),
      ble_mac: String(form.get('ble_mac')).trim().toUpperCase(),
      plate: String(form.get('plate') || '').trim() || null,
      model: String(form.get('model') || '').trim() || null,
    };
    const { error } = await supabase.from('vehicles').insert(payload);
    if (error) {
      setError(error.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    setShowForm(false);
    load();
  }

  async function toggleActive(v: Vehicle) {
    await supabase.from('vehicles').update({ active: !v.active }).eq('id', v.id);
    load();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Veículos</h2>
          <p className="panel-sub">Cadastro usado para gravar as tags NFC do painel (ver docs/04, Seção D.2).</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Novo veículo'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleAdd}>
          <input name="vehicle_id" placeholder="VEHICLE_ID (ex. TRUCK-042)" required />
          <input name="ble_mac" placeholder="MAC BLE (AA:BB:CC:DD:EE:FF)" required
            pattern="^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$" title="Formato: AA:BB:CC:DD:EE:FF" />
          <input name="plate" placeholder="Placa (opcional)" />
          <input name="model" placeholder="Modelo (opcional)" />
          <button type="submit">Salvar</button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>VEHICLE_ID</th>
              <th>MAC BLE</th>
              <th>Placa</th>
              <th>Modelo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td className="mono">{v.vehicle_id}</td>
                <td className="mono">{v.ble_mac}</td>
                <td>{v.plate ?? '—'}</td>
                <td>{v.model ?? '—'}</td>
                <td>
                  <button className={`pill ${v.active ? 'pill-ok' : 'pill-off'}`} onClick={() => toggleActive(v)}>
                    {v.active ? 'ativo' : 'inativo'}
                  </button>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Nenhum veículo cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
