import { useEffect, useState, type FormEvent } from 'react';
import { supabase, DEFAULT_TENANT_SETTINGS, type Tenant, type TenantSettings } from '../lib/supabaseClient';

/** Parâmetros gerais de uso da empresa — lidos pelo app do motorista ao entrar. */
export function TenantParamsPanel({ tenant }: { tenant: Tenant | null }) {
  const [s, setS] = useState<TenantSettings>({ ...DEFAULT_TENANT_SETTINGS, ...(tenant?.settings ?? {}) });
  const [options, setOptions] = useState(s.validity_options.join(', '));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const merged = { ...DEFAULT_TENANT_SETTINGS, ...(tenant?.settings ?? {}) };
    setS(merged);
    setOptions(merged.validity_options.join(', '));
  }, [tenant]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const opts = options.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 48);
    if (opts.length === 0) { setError('Informe ao menos uma opção de horas (1 a 48).'); return; }
    if (!opts.includes(s.default_validity_hours)) { setError('O padrão precisa estar entre as opções de horas.'); return; }
    if (s.emergency_default_hours > s.emergency_max_hours) { setError('A emergência padrão não pode passar do máximo.'); return; }
    const { error } = await supabase.rpc('update_tenant_settings', { p_settings: { ...s, validity_options: opts } });
    if (error) setError(error.message);
    else setMsg('Parâmetros salvos. O app aplica no próximo login/abertura.');
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Parâmetros de uso</h2>
          <p className="panel-sub">Configuração geral da empresa {tenant?.name ?? ''}, aplicada ao app dos motoristas.</p>
        </div>
      </div>
      <form className="params-form" onSubmit={save}>
        <label>Opções de tempo de uso liberado (horas, separadas por vírgula)
          <input value={options} onChange={(e) => setOptions(e.target.value)} />
        </label>
        <label>Tempo padrão (horas)
          <input type="number" min={1} max={48} value={s.default_validity_hours}
            onChange={(e) => setS({ ...s, default_validity_hours: Number(e.target.value) })} />
        </label>
        <label>Emergência — padrão (horas)
          <input type="number" min={1} max={12} value={s.emergency_default_hours}
            onChange={(e) => setS({ ...s, emergency_default_hours: Number(e.target.value) })} />
        </label>
        <label>Emergência — máximo permitido (horas)
          <input type="number" min={1} max={12} value={s.emergency_max_hours}
            onChange={(e) => setS({ ...s, emergency_max_hours: Number(e.target.value) })} />
        </label>
        <label className="check"><input type="checkbox" checked={s.require_final_km}
          onChange={(e) => setS({ ...s, require_final_km: e.target.checked })} />
          Exigir KM final ao desvincular o motorista</label>
        <label className="check"><input type="checkbox" checked={s.allow_partner}
          onChange={(e) => setS({ ...s, allow_partner: e.target.checked })} />
          Permitir motorista parceiro operar durante a posse do oficial</label>
        {error && <p className="form-error">{error}</p>}
        {msg && <p className="muted" style={{ padding: 0 }}>{msg}</p>}
        <div><button type="submit">Salvar parâmetros</button></div>
      </form>
    </section>
  );
}
