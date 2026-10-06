import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase, type Driver } from '../lib/supabaseClient';
import { csvToObjects, downloadCsv, objectsToCsv } from '../lib/csv';

const CSV_COLUMNS = ['driver_code', 'full_name'];

export function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [withPin, setWithPin] = useState<Set<string>>(new Set());
  const [pinFor, setPinFor] = useState<Driver | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setDrivers(data ?? []);
    const pins = await supabase.rpc('admin_drivers_with_access');
    if (!pins.error) setWithPin(new Set((pins.data ?? []) as string[]));
    setLoading(false);
  }

  async function handleSetPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pinFor) return;
    setPinError(null);
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('admin_set_driver_password', {
      p_code: pinFor.driver_code,
      p_email: String(f.get('email')).trim(),
      p_password: String(f.get('password') ?? ''),
    });
    if (error) { setPinError(error.message); return; }
    setPinFor(null);
    load();
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

  function handleExport() {
    const rows = drivers.map((d) => ({ driver_code: d.driver_code, full_name: d.full_name }));
    downloadCsv('condutores.csv', objectsToCsv(rows, CSV_COLUMNS));
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = csvToObjects(text);

    let ok = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const driver_code = (row.driver_code ?? '').trim();
      const full_name = (row.full_name ?? '').trim();
      if (!driver_code || !full_name) {
        errors.push(`Linha ignorada (driver_code/full_name vazio): ${JSON.stringify(row)}`);
        continue;
      }
      const { error } = await supabase
        .from('drivers')
        .upsert({ driver_code, full_name }, { onConflict: 'tenant_id,driver_code' });
      if (error) errors.push(`${driver_code}: ${error.message}`);
      else ok++;
    }

    setImportSummary(
      `Importação concluída: ${ok} condutor(es) gravado(s)${errors.length ? `, ${errors.length} erro(s)` : ''}.` +
        (errors.length ? ' Detalhes no console.' : '')
    );
    if (errors.length) console.warn('[DriversPanel] Erros de importação:', errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Condutores</h2>
          <p className="panel-sub">Somente condutores cadastrados aqui têm seus logs de viagem aceitos (trip_logs.driver_code é FK).</p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={handleExport}>Exportar CSV</button>
          <button className="ghost" onClick={() => fileInputRef.current?.click()}>Importar CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImportFile} />
          <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Novo condutor'}</button>
        </div>
      </div>

      {importSummary && <p className="muted" style={{ padding: 0, textAlign: 'left' }}>{importSummary}</p>}

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
              <th>Acesso ao app</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.driver_code}</td>
                <td>{d.full_name}{d.email && <div className="muted mono" style={{ padding: '2px 0 0', fontSize: 11 }}>{d.email}</div>}</td>
                <td>
                  <button className={`pill ${d.active ? 'pill-ok' : 'pill-off'}`} onClick={() => toggleActive(d)}>
                    {d.active ? 'ativo' : 'inativo'}
                  </button>
                </td>
                <td>
                  <button className="ghost" onClick={() => { setPinError(null); setPinFor(d); }}>
                    {withPin.has(d.driver_code) ? 'Editar acesso' : 'Definir acesso'}
                  </button>
                  {!withPin.has(d.driver_code) && <span className="muted" style={{ padding: '0 0 0 8px', fontSize: 11 }}>sem acesso ao app</span>}
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">Nenhum condutor cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {pinFor && (
        <div className="modal-backdrop" onClick={() => setPinFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Acesso ao app — {pinFor.full_name}</h3>
            <p>O motorista entra no app com <b>e-mail e senha</b> (no 1º acesso, também o código da empresa). Após 5 erros a conta trava por 15 min; definir uma nova senha destrava. Deixe a senha em branco para só alterar o e-mail.</p>
            <form onSubmit={handleSetPin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input name="email" type="email" placeholder="E-mail do motorista" defaultValue={pinFor.email ?? ''} required />
              <input name="password" type="password" minLength={6} placeholder="Senha (mín. 6 caracteres)" autoComplete="new-password" />
              {pinError && <p className="form-error">{pinError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit">Salvar acesso</button>
                <button type="button" className="ghost" onClick={() => setPinFor(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
