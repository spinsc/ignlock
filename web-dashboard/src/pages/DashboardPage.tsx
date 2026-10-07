import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../hooks/useProfile';
import { VehiclesPanel } from '../components/VehiclesPanel';
import { DriversPanel } from '../components/DriversPanel';
import { TripLogsPanel } from '../components/TripLogsPanel';
import { UsersPanel } from '../components/UsersPanel';
import { AccessPanel } from '../components/AccessPanel';
import { TrackingPanel } from '../components/TrackingPanel';
import { EmergencyPanel } from '../components/EmergencyPanel';
import { SponsorsPanel } from '../components/SponsorsPanel';
import { TenantParamsPanel } from '../components/TenantParamsPanel';
import { PlatformPanel } from '../components/PlatformPanel';
import { AdsStack } from '../components/AdsStack';

type Tab =
  | 'vehicles' | 'drivers' | 'access' | 'logs' | 'tracking' | 'emergency'
  | 'params' | 'sponsors' | 'platform' | 'users';

export function DashboardPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('logs');
  const { tenant, tenants, isAdmin, isSuperadmin } = useProfile(session);

  async function switchTenant(id: string) {
    const { error } = await supabase.rpc('switch_tenant', { p_tenant: id });
    if (!error) window.location.reload();
  }

  const tabBtn = (t: Tab, label: string) => (
    <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label}</button>
  );

  return (
    <div className="app-shell" style={tenant?.settings?.brand_color ? ({ '--brand': tenant.settings.brand_color } as React.CSSProperties) : undefined}>
      <header className="topbar">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}acn-logo.png`} alt="ACN Sinal Verde" />
        <div className="brand-block">
          <span className="brand">IGNLOCK · PAINEL DA FROTA</span>
          {tenant?.settings?.logo_url && <img className="tenant-logo" src={tenant.settings.logo_url} alt="" />}
          {isSuperadmin && tenants.length > 1 ? (
            <select className="tenant-select" value={tenant?.id ?? ''} onChange={(e) => switchTenant(e.target.value)}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <span className="tenant-name">{tenant?.name ?? '—'}</span>
          )}
        </div>
        <nav className="tabs">
          {tabBtn('logs', 'Logs de Viagem')}
          {tabBtn('tracking', 'Rastreamento')}
          {tabBtn('vehicles', 'Veículos')}
          {tabBtn('drivers', 'Condutores')}
          {tabBtn('access', 'Autorizações')}
          {tabBtn('emergency', 'Emergências')}
          {isAdmin && tabBtn('params', 'Parâmetros')}
          {isAdmin && tabBtn('users', 'Usuários')}
          {isSuperadmin && tabBtn('sponsors', 'Patrocinadores')}
          {isSuperadmin && tabBtn('platform', 'Plataforma')}
        </nav>
        <div className="topbar-user">
          <span className="mono">{session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <AdsStack />

      <main className="app-main">
        {tab === 'logs' && <TripLogsPanel />}
        {tab === 'tracking' && <TrackingPanel />}
        {tab === 'vehicles' && <VehiclesPanel />}
        {tab === 'drivers' && <DriversPanel />}
        {tab === 'access' && <AccessPanel />}
        {tab === 'emergency' && <EmergencyPanel />}
        {tab === 'params' && isAdmin && <TenantParamsPanel tenant={tenant} />}
        {tab === 'sponsors' && isSuperadmin && <SponsorsPanel />}
        {tab === 'platform' && isSuperadmin && <PlatformPanel currentTenantId={tenant?.id ?? null} />}
        {tab === 'users' && <UsersPanel isAdmin={isAdmin} />}
      </main>
    </div>
  );
}
