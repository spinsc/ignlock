import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase, type Vehicle } from '../lib/supabaseClient';
import { csvToObjects, downloadCsv, objectsToCsv } from '../lib/csv';
import { isWebNfcSupported, vehicleTagPayload, writeVehicleTag } from '../lib/nfcWriter';

const CSV_COLUMNS = ['vehicle_id', 'ble_mac', 'plate', 'model'];
const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

type NfcState = { vehicle: Vehicle; status: 'idle' | 'writing' | 'success' | 'error' | 'unsupported'; message?: string };

export function VehiclesPanel() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [nfc, setNfc] = useState<NfcState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleExport() {
    const rows = vehicles.map((v) => ({
      vehicle_id: v.vehicle_id,
      ble_mac: v.ble_mac,
      plate: v.plate ?? '',
      model: v.model ?? '',
    }));
    downloadCsv('veiculos.csv', objectsToCsv(rows, CSV_COLUMNS));
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = csvToObjects(text);

    let ok = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const vehicle_id = (row.vehicle_id ?? '').trim();
      const ble_mac = (row.ble_mac ?? '').trim().toUpperCase();
      if (!vehicle_id || !MAC_PATTERN.test(ble_mac)) {
        errors.push(`Linha ignorada (vehicle_id/ble_mac inválido): ${JSON.stringify(row)}`);
        continue;
      }
      const { error } = await supabase.from('vehicles').upsert(
        {
          vehicle_id,
          ble_mac,
          plate: row.plate?.trim() || null,
          model: row.model?.trim() || null,
        },
        { onConflict: 'vehicle_id' }
      );
      if (error) errors.push(`${vehicle_id}: ${error.message}`);
      else ok++;
    }

    setImportSummary(
      `Importação concluída: ${ok} veículo(s) gravado(s)${errors.length ? `, ${errors.length} erro(s)` : ''}.` +
        (errors.length ? ' Detalhes no console.' : '')
    );
    if (errors.length) console.warn('[VehiclesPanel] Erros de importação:', errors);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  }

  async function handleWriteTag(v: Vehicle) {
    if (!isWebNfcSupported()) {
      setNfc({ vehicle: v, status: 'unsupported' });
      return;
    }
    setNfc({ vehicle: v, status: 'writing' });
    try {
      await writeVehicleTag(v.vehicle_id, v.ble_mac);
      setNfc({ vehicle: v, status: 'success' });
    } catch (err) {
      setNfc({ vehicle: v, status: 'error', message: (err as Error).message });
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Veículos</h2>
          <p className="panel-sub">Cadastro usado para gravar as tags NFC do painel (ver docs/04, Seção D.2).</p>
        </div>
        <div className="head-actions">
          <button className="ghost" onClick={handleExport}>Exportar CSV</button>
          <button className="ghost" onClick={() => fileInputRef.current?.click()}>Importar CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImportFile} />
          <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Novo veículo'}</button>
        </div>
      </div>

      {importSummary && <p className="muted" style={{ padding: 0, textAlign: 'left' }}>{importSummary}</p>}

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
              <th>Tag NFC</th>
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
                <td>
                  <button className="ghost" onClick={() => handleWriteTag(v)}>Gravar NFC</button>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">Nenhum veículo cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {nfc && <NfcWriteDialog state={nfc} onClose={() => setNfc(null)} onRetry={() => handleWriteTag(nfc.vehicle)} />}
    </section>
  );
}

function NfcWriteDialog({ state, onClose, onRetry }: { state: NfcState; onClose: () => void; onRetry: () => void }) {
  const payload = vehicleTagPayload(state.vehicle.vehicle_id, state.vehicle.ble_mac);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Gravar tag NFC — {state.vehicle.vehicle_id}</h3>

        {state.status === 'writing' && <p>Aproxime o celular da tag NFC no painel do veículo…</p>}

        {state.status === 'success' && <p className="muted">Tag gravada com sucesso.</p>}

        {state.status === 'error' && (
          <>
            <p className="form-error">Falha ao gravar: {state.message}</p>
            <button onClick={onRetry}>Tentar novamente</button>
          </>
        )}

        {state.status === 'unsupported' && (
          <>
            <p className="muted">
              Este navegador não suporta gravação de NFC pela web (Web NFC só funciona no Chrome para Android).
              Grave manualmente com um app como <strong>NFC Tools</strong>, usando este texto como registro de texto (Text Record):
            </p>
            <code className="payload-box">{payload}</code>
          </>
        )}

        <button className="ghost" onClick={onClose} style={{ marginTop: 12 }}>Fechar</button>
      </div>
    </div>
  );
}
