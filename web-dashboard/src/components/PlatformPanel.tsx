import { useEffect, useState } from 'react';
import { supabase, type Tenant, type TenantRequest } from '../lib/supabaseClient';

type Approved = { tenant: { name: string; slug: string }; email: string; temp_password: string };

/** Painel da plataforma (superadmin ACN): empresas clientes e solicitações de acesso. */
export function PlatformPanel({ currentTenantId }: { currentTenantId: string | null }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [requests, setRequests] = useState<TenantRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [approved, setApproved] = useState<Approved | null>(null);

  async function load() {
    const [t, r] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at'),
      supabase.from('tenant_requests').select('*').order('created_at', { ascending: false }),
    ]);
    if (t.error) setError(t.error.message); else setTenants((t.data ?? []) as Tenant[]);
    if (r.error) setError(r.error.message); else setRequests((r.data ?? []) as TenantRequest[]);
  }
  useEffect(() => { load(); }, []);

  async function approve(req: TenantRequest) {
    setBusy(req.id); setError(null); setApproved(null);
    const { data, error } = await supabase.functions.invoke('approve-tenant-request', { body: { request_id: req.id } });
    setBusy(null);
    if (error || data?.error) { setError(data?.error ?? error?.message ?? 'Falha ao aprovar'); return; }
    setApproved(data as Approved);
    load();
  }

  async function reject(req: TenantRequest) {
    setBusy(req.id); setError(null);
    const { error } = await supabase.from('tenant_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', req.id);
    setBusy(null);
    if (error) setError(error.message); else load();
  }

  async function toggleStatus(t: Tenant) {
    const { error } = await supabase.from('tenants')
      .update({ status: t.status === 'active' ? 'suspended' : 'active' }).eq('id', t.id);
    if (error) setError(error.message); else load();
  }

  async function enter(t: Tenant) {
    const { error } = await supabase.rpc('switch_tenant', { p_tenant: t.id });
    if (error) setError(error.message); else window.location.reload();
  }

  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Plataforma</h2>
          <p className="panel-sub">Empresas clientes e solicitações de acesso. Cada empresa só enxerga os próprios dados.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}

      {approved && (
        <div className="callout-ok">
          <b>Empresa criada: {approved.tenant.name}</b> (código <span className="mono">{approved.tenant.slug}</span> — é o que o motorista digita no 1º acesso do app).
          <div>Administrador: <span className="mono">{approved.email}</span> · senha provisória: <span className="mono">{approved.temp_password}</span></div>
          <small>Envie por canal seguro; ela não aparece de novo e será trocada no primeiro login.</small>
        </div>
      )}

      <h3 className="sub-h">Solicitações de acesso ({pending.length} pendente{pending.length === 1 ? '' : 's'})</h3>
      <table>
        <thead><tr><th>Empresa</th><th>Contato</th><th>Data</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.company_name}{r.message && <div className="muted" style={{ padding: '2px 0 0', fontSize: 11 }}>{r.message}</div>}</td>
              <td>{r.contact_name}<div className="muted mono" style={{ padding: '2px 0 0', fontSize: 11 }}>{r.email}{r.phone ? ` · ${r.phone}` : ''}</div></td>
              <td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
              <td><span className={`pill ${r.status === 'approved' ? 'pill-ok' : 'pill-off'}`}>{r.status === 'pending' ? 'pendente' : r.status === 'approved' ? 'aprovada' : 'recusada'}</span></td>
              <td style={{ display: 'flex', gap: 6 }}>
                {r.status === 'pending' && (
                  <>
                    <button disabled={busy === r.id} onClick={() => approve(r)}>Aprovar</button>
                    <button className="ghost" disabled={busy === r.id} onClick={() => reject(r)}>Recusar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {requests.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma solicitação.</td></tr>}
        </tbody>
      </table>

      <h3 className="sub-h">Empresas</h3>
      <table>
        <thead><tr><th>Empresa</th><th>Código</th><th>Criada em</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td>{t.name}{t.id === currentTenantId && <span className="muted" style={{ padding: '0 0 0 8px', fontSize: 11 }}>(ativa no painel)</span>}</td>
              <td className="mono">{t.slug}</td>
              <td>{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
              <td><button className={`pill ${t.status === 'active' ? 'pill-ok' : 'pill-off'}`} onClick={() => toggleStatus(t)}>{t.status === 'active' ? 'ativa' : 'suspensa'}</button></td>
              <td>{t.id !== currentTenantId && <button className="ghost" onClick={() => enter(t)}>Abrir no painel</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
