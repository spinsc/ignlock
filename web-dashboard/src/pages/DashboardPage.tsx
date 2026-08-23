import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useProfile } from '../hooks/useProfile';
import { VehiclesPanel } from '../components/VehiclesPanel';
import { DriversPanel } from '../components/DriversPanel';
import { TripLogsPanel } from '../components/TripLogsPanel';
import { UsersPanel } from '../components/UsersPanel';
import { AccessPanel } from '../components/AccessPanel';

type Tab = 'vehicles' | 'drivers' | 'access' | 'logs' | 'users';

export function DashboardPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('logs');
  const { isAdmin } = useProfile(session);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">IGNLOCK · PAINEL DA FROTA</span>
        <nav className="tabs">
          <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Logs de Viagem</button>
          <button className={tab === 'vehicles' ? 'active' : ''} onClick={() => setTab('vehicles')}>Veículos</button>
          <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')}>Condutores</button>
          <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>Autorizações</button>
          {isAdmin && (
            <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Usuários</button>
          )}
        </nav>
        <div className="topbar-user">
          <span className="mono">{session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'logs' && <TripLogsPanel />}
        {tab === 'vehicles' && <VehiclesPanel />}
        {tab === 'drivers' && <DriversPanel />}
        {tab === 'access' && <AccessPanel />}
        {tab === 'users' && <UsersPanel isAdmin={isAdmin} />}
      </main>
    </div>
  );
}
