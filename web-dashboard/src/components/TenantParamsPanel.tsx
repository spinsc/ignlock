import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { supabase, DEFAULT_TENANT_SETTINGS, type Tenant, type TenantSettings } from '../lib/supabaseClient';

/**
 * Parâmetros gerais de uso da empresa, identidade visual (logo + cor, mesmo
 * APK para todas as empresas) e convite de primeiro acesso por QR/link.
 * Tudo é lido pelo app do motorista ao entrar.
 */
export function TenantParamsPanel({ tenant }: { tenant: Tenant | null }) {
  const merged = () => ({ ...DEFAULT_TENANT_SETTINGS, ...(tenant?.settings ?? {}) });
  const [s, setS] = useState<TenantSettings>(merged());
  const [options, setOptions] = useState(s.validity_options.join(', '));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteLink = tenant
    ? `${window.location.origin}${import.meta.env.BASE_URL}join.html?c=${encodeURIComponent(tenant.slug)}`
    : '';

  useEffect(() => {
    const m = merged();
    setS(m);
    setOptions(m.validity_options.join(', '));
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inviteLink) return;
    QRCode.toDataURL(inviteLink, { width: 280, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [inviteLink]);

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    setUploading(true);
    setError(null);
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${tenant.id}/logo-${Date.now()}.${ext || 'png'}`;
    const { error: upErr } = await supabase.storage.from('tenant-logos').upload(path, file, { contentType: file.type });
    setUploading(false);
    if (upErr) { setError(`Falha ao enviar a logo: ${upErr.message}`); return; }
    const url = supabase.storage.from('tenant-logos').getPublicUrl(path).data.publicUrl;
    setS((prev) => ({ ...prev, logo_url: url }));
    setMsg('Logo enviada — clique em "Salvar parâmetros" para aplicar.');
  }

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

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        <h3 className="sub-h">Identidade visual no app</h3>
        <label>Cor da marca
          <span className="color-row">
            <input type="color" value={s.brand_color ?? '#1F6E62'} onChange={(e) => setS({ ...s, brand_color: e.target.value })} />
            <span className="mono">{s.brand_color ?? 'padrão do app'}</span>
            {s.brand_color && <button type="button" className="ghost" onClick={() => setS({ ...s, brand_color: null })}>Remover</button>}
          </span>
        </label>
        <label>Logo da empresa (PNG/JPG, fundo claro ou transparente)
          <input type="file" accept="image/*" onChange={uploadLogo} disabled={uploading} />
        </label>
        {s.logo_url && (
          <span className="logo-preview">
            <img src={s.logo_url} alt="Logo da empresa" />
            <button type="button" className="ghost" onClick={() => setS({ ...s, logo_url: null })}>Remover logo</button>
          </span>
        )}

        {error && <p className="form-error">{error}</p>}
        {msg && <p className="muted" style={{ padding: 0 }}>{msg}</p>}
        <div><button type="submit" disabled={uploading}>Salvar parâmetros</button></div>
      </form>

      {tenant && (
        <div className="invite-box">
          <h3 className="sub-h">Convite de primeiro acesso dos motoristas</h3>
          <p className="muted" style={{ padding: 0, textAlign: 'left' }}>
            O motorista escaneia o QR (ou abre o link) no celular: o app abre já com a empresa preenchida
            (código <span className="mono">{tenant.slug}</span>) e só falta e-mail e senha.
          </p>
          <div className="invite-row">
            {qr && <img src={qr} alt="QR code de convite" width={160} height={160} />}
            <div>
              <code className="payload-box">{inviteLink}</code>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="ghost" onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar link'}</button>
                {qr && <a className="ghost-link" href={qr} download={`convite-${tenant.slug}.png`}>Baixar QR (PNG)</a>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
