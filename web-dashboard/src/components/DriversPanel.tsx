import { useEffect, useState, type FormEvent } from 'react';
import { supabase, type Driver } from '../lib/supabaseClient';

export function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setDrivers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      driver_code: String(form.get('driver_code')).trim(),
      full_name: String(form.get('full_name')).trim(),
    };
    const { error } = await supabase.from('drivers').insert(payload);
    if (error) {
      setError(error.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    setShowForm(false);
    load();
  }

  async function toggleActive(d: Driver) {
    await supabase.from('drivers').update({ active: !d.active }).eq('id', d.id);
    load();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Condutores</h2>
          <p className="panel-sub">Somente condutores cadastrados aqui têm seus logs de viagem aceitos (trip_logs.driver_code é FK).</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Novo condutor'}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleAdd}>
          <input name="driver_code" placeholder="Matrícula / ID" required />
          <input name="full_name" placeholder="Nome completo" required />
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
              <th>Matrícula</th>
              <th>Nome</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.driver_code}</td>
                <td>{d.full_name}</td>
                <td>
                  <button className={`pill ${d.active ? 'pill-ok' : 'pill-off'}`} onClick={() => toggleActive(d)}>
                    {d.active ? 'ativo' : 'inativo'}
                  </button>
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">Nenhum condutor cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
