import { useEffect, useState } from 'react';
import { supabase, type Driver, type EmergencyEvent } from '../lib/supabaseClient';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

/**
 * Log do botão físico de emergência (hardware opcional, ver docs/12).
 * O firmware não coleta motorista/motivo no momento do acionamento — só
 * grava o instante. Esta tela existe para que o evento possa ser
 * justificado depois, via sistema (o "administrativamente" da regra de
 * negócio acontece fora do app, e não precisa de tela).
 */
export function EmergencyPanel() {
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rascunho de justificativa em edição, por id de evento.
  const [draftDriver, setDraftDriver] = useState<Record<string, string>>({});
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      supabase
        .from('emergency_events')
        .select('*, drivers(full_name), vehicles(plate, model)')
        .order('triggered_at', { ascending: false })
        .limit(200),
      supabase.from('drivers').select('*').order('full_name'),
    ]).then(([e, d]) => {
      if (e.error) setError(e.error.message);
      else setEvents((e.data ?? []) as unknown as EmergencyEvent[]);
      if (d.data) setDrivers(d.data as Driver[]);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function saveJustification(ev: EmergencyEvent) {
    const driverCode = draftDriver[ev.id] ?? '';
    const text = (draftText[ev.id] ?? '').trim();
    if (!text) { setError('Descreva o motivo antes de salvar.'); return; }
    setSaving(ev.id);
    setError(null);
    const { error } = await supabase
      .from('emergency_events')
      .update({
        driver_code: driverCode || null,
        justification: text,
        justified_at: new Date().toISOString(),
        justified_by: 'admin',
      })
      .eq('id', ev.id);
    setSaving(null);
    if (error) { setError(error.message); return; }
    load();
  }

  const pending = events.filter((e) => !e.justification).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Emergências</h2>
          <p className="panel-sub">
            Acionamentos do botão físico de emergência (libera a partida imediatamente, sem NFC/BLE).
            {pending > 0 && <> <b>{pending}</b> ainda sem justificativa.</>}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Veículo</th>
              <th>Acionado em</th>
              <th>Motorista</th>
              <th>Justificativa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const vehicleExtra = [ev.vehicles?.plate, ev.vehicles?.model].filter(Boolean).join(' · ');
              const justified = Boolean(ev.justification);
              return (
                <tr key={ev.id}>
                  <td>
                    <span className="mono">{ev.vehicle_id}</span>
                    {vehicleExtra && <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>{vehicleExtra}</div>}
                  </td>
                  <td>{formatDate(ev.triggered_at)}</td>
                  <td>
                    {justified ? (
                      <span>{ev.drivers?.full_name ?? ev.driver_code ?? '—'}</span>
                    ) : (
                      <select
                        value={draftDriver[ev.id] ?? ''}
                        onChange={(e) => setDraftDriver((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                        style={{ padding: '6px 8px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
                      >
                        <option value="">(não identificado)</option>
                        {drivers.map((d) => <option key={d.driver_code} value={d.driver_code}>{d.full_name}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ minWidth: 260 }}>
                    {justified ? (
                      <>
                        <span>{ev.justification}</span>
                        <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>
                          {ev.justified_by === 'motorista' ? 'via app, pelo motorista' : 'registrado no painel'} em {ev.justified_at ? formatDate(ev.justified_at) : '—'}
                        </div>
                      </>
                    ) : (
                      <textarea
                        placeholder="Motivo do uso de emergência…"
                        value={draftText[ev.id] ?? ''}
                        onChange={(e) => setDraftText((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                        rows={2}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)', font: 'inherit', resize: 'vertical' }}
                      />
                    )}
                  </td>
                  <td>
                    {!justified && (
                      <button type="button" onClick={() => saveJustification(ev)} disabled={saving === ev.id}>
                        Salvar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">Nenhum acionamento de emergência registrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
