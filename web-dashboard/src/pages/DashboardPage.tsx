import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { VehiclesPanel } from '../components/VehiclesPanel';
import { DriversPanel } from '../components/DriversPanel';
import { TripLogsPanel } from '../components/TripLogsPanel';

type Tab = 'vehicles' | 'drivers' | 'logs';

export function DashboardPage({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('logs');

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">IGNLOCK · PAINEL DA FROTA</span>
        <nav className="tabs">
          <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Logs de Viagem</button>
          <button className={tab === 'vehicles' ? 'active' : ''} onClick={() => setTab('vehicles')}>Veículos</button>
          <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')}>Condutores</button>
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
      </main>
    </div>
  );
}
