import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  creditGet, creditSet, driverLogin, fetchAds, insertSnapshot, insertTripEnd, isDriverActive,
  partnerLinks, resolveTenant, resolveVehicleBySuffix, tenantInfo,
  type Ad, type PartnerLink, type TenantSettings,
} from './api';
import { bleSupported, nameFromMac, VehicleLink, type Status } from './ble';
import { QrScanner } from './QrScanner';
import {
  clearActive, enqueue, flushQueue, forgetTenant, loadActive, loadPartners, loadSession, loadSettings,
  logout, saveActive, saveDriver, savePartners, saveSettings, saveTenant, savedTenant,
  type ActiveVehicle, type Session,
} from './store';

type Vehicle = { vehicleId: string; bleMac: string };

const fmtHms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(x)}`;
};
const fmtHm = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}min`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ======================================================================
export default function DriverApp() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [settings, setSettings] = useState<TenantSettings>(loadSettings);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', settings.brandColor ?? '#1f6e62');
  }, [settings.brandColor]);

  // ao abrir: confere se o motorista segue ativo e atualiza parâmetros/parceiros (melhor esforço)
  useEffect(() => {
    if (!session) return;
    (async () => {
      if (!(await isDriverActive(session.tenantId, session.driverCode))) { logout(); setSession(null); return; }
      const t = await tenantInfo(session.tenantId);
      if (t) { saveSettings(t.settings); setSettings(t.settings); }
      const p = await partnerLinks(session.tenantId, session.driverCode);
      if (p) savePartners(p);
      flushQueue();
    })();
  }, [session]);

  if (!session) {
    return (
      <Login
        onLoggedIn={(s, st) => { setSettings(st); setSession(s); }}
        onBrand={(st) => setSettings(st)}
      />
    );
  }
  return <Main session={session} settings={settings} onLogout={() => { logout(); setSession(null); }} />;
}

// ======================================================================
function Login({ onLoggedIn, onBrand }: { onLoggedIn: (s: Session, st: TenantSettings) => void; onBrand: (st: TenantSettings) => void }) {
  const invite = new URLSearchParams(window.location.search).get('c');
  const [saved, setSaved] = useState(savedTenant());
  const [company, setCompany] = useState(invite ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invitedName, setInvitedName] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  // convite (?c=codigo) ou empresa lembrada: mostra a marca antes de entrar
  useEffect(() => {
    const code = saved ? saved.name : invite;
    if (!code) return;
    resolveTenant(code).then((t) => {
      if (!t) return;
      onBrand(t.settings);
      setLogo(t.settings.logoUrl);
      if (!saved) setInvitedName(t.name);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let tenant = saved ? { id: saved.id, name: saved.name } : null;
    let st = loadSettings();
    if (!tenant) {
      const t = await resolveTenant(company);
      if (!t) { setBusy(false); setError('Empresa não encontrada. Confira o nome (ou código) informado pelo administrador.'); return; }
      tenant = { id: t.id, name: t.name };
      st = t.settings;
    } else {
      const t = await tenantInfo(tenant.id);
      if (t) st = t.settings;
    }
    const r = await driverLogin(tenant.id, email, password);
    setBusy(false);
    if (r.status === 'ok') {
      saveTenant(tenant.id, tenant.name, st);
      saveDriver(r.driverCode, r.fullName);
      const p = await partnerLinks(tenant.id, r.driverCode);
      if (p) savePartners(p);
      onLoggedIn({ tenantId: tenant.id, tenantName: tenant.name, driverCode: r.driverCode, fullName: r.fullName }, st);
    } else if (r.status === 'locked') setError('Muitas tentativas. Conta bloqueada por 15 minutos — ou peça uma nova senha ao administrador.');
    else if (r.status === 'offline') setError('Sem conexão com o servidor. O primeiro acesso precisa de internet.');
    else setError('E-mail ou senha incorretos.');
  }

  return (
    <div className="app">
      <div className="bar"><img src={logo ?? `${import.meta.env.BASE_URL}acn-logo.png`} alt="" /><b>IGNLOCK</b></div>
      <form className="body" onSubmit={submit}>
        {invitedName && <span className="badge">Convite da empresa {invitedName}</span>}
        {saved ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ flex: 1 }}>{saved.name}</b>
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '6px 12px' }}
              onClick={() => { forgetTenant(); setSaved(null); setLogo(null); }}>Trocar</button>
          </div>
        ) : (
          <label className="f">Empresa (só no primeiro acesso)
            <input value={company} onChange={(e) => setCompany(e.target.value)} required readOnly={!!invitedName} />
          </label>
        )}
        <label className="f">E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="f">Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="err">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted">E-mail e senha são cadastrados pelo administrador da sua empresa. O primeiro acesso precisa de internet.</p>
      </form>
    </div>
  );
}

// ======================================================================
type View =
  | { k: 'home' }
  | { k: 'scan' }
  | { k: 'confirm'; vehicle: Vehicle }
  | { k: 'busy'; msg: string }
  | { k: 'form'; vehicle: Vehicle; credit: number; odoKm: number | null; emergencyNote: boolean }
  | { k: 'control'; vehicle: ActiveVehicle; actingFor?: string }
  | { k: 'admin'; vehicle: Vehicle }
  | { k: 'error'; msg: string };

function Main({ session, settings, onLogout }: { session: Session; settings: TenantSettings; onLogout: () => void }) {
  const [view, setView] = useState<View>({ k: 'home' });
  const [active, setActive] = useState<ActiveVehicle | null>(loadActive);
  const link = useRef(new VehicleLink());

  const freshLink = () => { link.current.disconnect(); link.current = new VehicleLink(); return link.current; };
  const goHome = () => { setActive(loadActive()); setView({ k: 'home' }); };

  // ---- identifica o veículo (QR) e conecta; o clique no botão dá o "gesto" que o Bluetooth exige
  function onQr(text: string) {
    const [vehicleId, bleMac] = text.trim().split(';');
    if (!vehicleId || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(bleMac ?? '')) {
      setView({ k: 'error', msg: 'QR inválido: não é um QR de veículo IGNLOCK.' });
      return;
    }
    setView({ k: 'confirm', vehicle: { vehicleId, bleMac: bleMac.toUpperCase() } });
  }

  const connectAndProceed = useCallback(async (vehicle: Vehicle | null, resume?: ActiveVehicle) => {
    try {
      const l = freshLink();
      setView({ k: 'busy', msg: 'Selecione o veículo na lista Bluetooth…' });
      await l.connect(vehicle ? nameFromMac(vehicle.bleMac) : resume ? nameFromMac(resume.bleMac) : undefined);

      let v: Vehicle | null = vehicle ?? (resume ? { vehicleId: resume.vehicleId, bleMac: resume.bleMac } : null);
      if (!v) { // escolheu na lista: acha o veículo da empresa pelo nome anunciado
        const suffix = l.name.replace('IGNLOCK-', '');
        v = await resolveVehicleBySuffix(session.tenantId, suffix);
        if (!v) throw new Error(`O veículo ${l.name} não está cadastrado na sua empresa.`);
      }
      setView({ k: 'busy', msg: 'Lendo o veículo…' });

      // emergência pendente no ESP32: sincroniza (melhor esforço)
      let emergencyNote = false;
      const epoch = await l.pendingEmergencyEpoch();
      if (epoch > 0) {
        const triggered = epoch === 1 ? new Date() : new Date(epoch * 1000);
        const row = { tenant_id: session.tenantId, vehicle_id: v.vehicleId, triggered_at: triggered.toISOString() };
        enqueue({ kind: 'emergency', row });
        if ((await flushQueue()) > 0) { try { await l.ackEmergency(); } catch { /* tenta na próxima */ } }
        emergencyNote = true;
      }

      // exclusividade
      const st = await l.status();
      const holder = st.driverId;
      const occupied = (st.state === 'unlocked' || st.state === 'paused') && holder !== '' && holder !== 'EMERGENCY' && st.remainingSeconds > 0;
      if (occupied && holder !== session.driverCode) {
        const partner = settings.allowPartner && loadPartners().some((p: PartnerLink) => p.vehicleId === v!.vehicleId && p.officialDriverCode === holder);
        if (partner) { setView({ k: 'control', vehicle: { vehicleId: v.vehicleId, bleMac: v.bleMac, releasedAtMs: 0, validHours: 0 }, actingFor: holder }); return; }
        throw new Error(`Veículo em uso por ${holder} (restam ${fmtHm(st.remainingSeconds)}). Só o motorista parceiro dele, ou o próprio ao desvincular, libera o veículo.`);
      }
      if (occupied && holder === session.driverCode) {
        const known = loadActive();
        const a = known && known.vehicleId === v.vehicleId ? known : { vehicleId: v.vehicleId, bleMac: v.bleMac, releasedAtMs: Date.now(), validHours: 0 };
        setView({ k: 'control', vehicle: a });
        return;
      }

      const credit = await creditGet(session.tenantId, session.driverCode);
      const odoKm = await l.odometerKm();
      setView({ k: 'form', vehicle: v, credit, odoKm, emergencyNote });
    } catch (e) {
      setView({ k: 'error', msg: errText(e) });
    }
  }, [session, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandLogo = settings.logoUrl ?? `${import.meta.env.BASE_URL}acn-logo.png`;
  const bar = (
    <div className="bar">
      <img src={brandLogo} alt="" />
      <b>{session.tenantName}</b>
      <button onClick={onLogout} title={session.fullName}>Sair</button>
    </div>
  );

  if (view.k === 'scan') {
    return <div className="app">{bar}<QrScanner onResult={onQr} onCancel={goHome} /></div>;
  }

  return (
    <div className="app">
      {bar}
      <div className="body">
        {view.k === 'home' && (
          <>
            <Ads />
            <p className="center">Olá, <b>{session.fullName}</b></p>
            {!bleSupported() && (
              <div className="card"><p className="err">Este navegador não tem Bluetooth Web. No <b>iPhone</b>, abra este endereço no navegador <b>Bluefy</b> (App Store); no Android, use o <b>Chrome</b>.</p></div>
            )}
            <button className="btn" onClick={() => setView({ k: 'scan' })}>Ler QR do veículo</button>
            <button className="btn ghost" disabled={!bleSupported()} onClick={() => connectAndProceed(null)}>Escolher o veículo pelo Bluetooth</button>
            {active && (
              <button className="btn ghost" disabled={!bleSupported()} onClick={() => connectAndProceed(null, active)}>
                Ligar/desligar partida — {active.vehicleId}
              </button>
            )}
          </>
        )}

        {view.k === 'confirm' && (
          <>
            <div className="card center"><p className="muted">Veículo identificado</p><div className="big" style={{ fontSize: 28 }}>{view.vehicle.vehicleId}</div></div>
            <button className="btn" onClick={() => connectAndProceed(view.vehicle)}>Conectar por Bluetooth</button>
            <button className="btn ghost" onClick={goHome}>Cancelar</button>
          </>
        )}

        {view.k === 'busy' && <div className="card center"><p>{view.msg}</p></div>}

        {view.k === 'error' && (
          <>
            <div className="card"><p className="err">{view.msg}</p></div>
            <button className="btn" onClick={goHome}>Tentar novamente</button>
          </>
        )}

        {view.k === 'form' && (
          <ReleaseForm
            session={session} settings={settings} link={link.current}
            vehicle={view.vehicle} credit={view.credit} odoKm={view.odoKm} emergencyNote={view.emergencyNote}
            onDone={(a) => { setActive(a); setView({ k: 'control', vehicle: a }); }}
            onAdmin={() => setView({ k: 'admin', vehicle: view.vehicle })}
            onCancel={() => { link.current.disconnect(); goHome(); }}
          />
        )}

        {view.k === 'control' && (
          <Control
            key={view.vehicle.vehicleId + (view.actingFor ?? '')}
            session={session} settings={settings} link={link.current}
            vehicle={view.vehicle} actingFor={view.actingFor}
            onExit={() => { link.current.disconnect(); goHome(); }}
          />
        )}

        {view.k === 'admin' && <Admin link={link.current} settings={settings} vehicle={view.vehicle} onBack={() => { link.current.disconnect(); goHome(); }} />}
      </div>
    </div>
  );
}

// ======================================================================
function Ads() {
  const [ads, setAds] = useState<Ad[]>([]);
  useEffect(() => { fetchAds().then(setAds).catch(() => setAds([])); }, []);
  if (ads.length === 0) return null;
  return (
    <div className="ads">
      {ads.map((a) => {
        const body = (<><img src={a.image_url} alt="" /><span><b>{a.headline ?? a.sponsor_name}</b><small>Patrocinado · {a.sponsor_name}</small></span></>);
        return a.link_url
          ? <a key={a.id} className="ad" href={a.link_url} target="_blank" rel="noopener noreferrer">{body}</a>
          : <div key={a.id} className="ad">{body}</div>;
      })}
    </div>
  );
}

// ======================================================================
function ReleaseForm(p: {
  session: Session; settings: TenantSettings; link: VehicleLink; vehicle: Vehicle; credit: number; odoKm: number | null;
  emergencyNote: boolean; onDone: (a: ActiveVehicle) => void; onAdmin: () => void; onCancel: () => void;
}) {
  const [km, setKm] = useState(p.odoKm !== null ? String(p.odoKm) : '');
  const [dest, setDest] = useState('');
  const [hours, setHours] = useState(p.settings.defaultValidityHours);
  const [useCredit, setUseCredit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCredit = p.credit >= 60;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = p.session.driverCode;
      const credit = useCredit && hasCredit;
      const h = credit ? Math.min(48, Math.max(1, Math.ceil(p.credit / 3600))) : hours;
      const budget = credit ? Math.min(48 * 3600, Math.max(60, p.credit)) : undefined;
      const granted = budget ?? h * 3600;

      await p.link.ensure();
      await p.link.sendAuth(me, h, budget);
      const st = await p.link.status(); // o BLE aceita a escrita mesmo se o firmware recusar a regra
      if (st.state !== 'unlocked' || st.driverId !== me) {
        throw new Error(st.driverId && st.driverId !== me ? `O veículo está vinculado a ${st.driverId} e recusou a liberação.` : 'O veículo não confirmou a liberação. Tente de novo.');
      }

      const now = Date.now();
      enqueue({
        kind: 'trip_log',
        row: {
          tenant_id: p.session.tenantId, vehicle_id: p.vehicle.vehicleId, driver_code: me,
          odometer_km: parseInt(km, 10), destination: dest.trim(), valid_hours: h,
          released_at: new Date(now).toISOString(), expires_at: new Date(now + granted * 1000).toISOString(),
          odometer_source: p.odoKm !== null ? 'obd' : 'manual',
        },
      });
      const a: ActiveVehicle = { vehicleId: p.vehicle.vehicleId, bleMac: p.vehicle.bleMac, releasedAtMs: now, validHours: h };
      saveActive(a);
      insertSnapshot({
        tenant_id: p.session.tenantId, vehicle_id: a.vehicleId, driver_code: me,
        released_at: new Date(now).toISOString(), state: 'UNLOCKED', remaining_seconds: granted,
      });
      if (credit) creditSet(p.session.tenantId, me, 0);
      flushQueue();
      p.onDone(a);
    } catch (e2) {
      setError(errText(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'contents' }}>
      <b>Veículo: {p.vehicle.vehicleId}</b>
      {p.emergencyNote && <div className="card"><p className="muted">Este veículo teve o botão de emergência acionado. O evento foi enviado ao painel — a justificativa é preenchida lá.</p></div>}
      <p className="muted">Condutor: {p.session.fullName} ({p.session.driverCode})</p>
      <label className="f">KM atual do odômetro {p.odoKm !== null && '(lido da OBD-II)'}
        <input inputMode="numeric" pattern="[0-9]+" value={km} onChange={(e) => setKm(e.target.value)} readOnly={p.odoKm !== null} required />
      </label>
      <label className="f">Destino
        <input value={dest} onChange={(e) => setDest(e.target.value)} required />
      </label>
      {hasCredit && (
        <label className="check"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
          <span>Usar meu crédito de {fmtHm(p.credit)} <small className="muted">(tempo que sobrou de uma viagem anterior)</small></span></label>
      )}
      {!(useCredit && hasCredit) && (
        <label className="f">Tempo de uso liberado
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {p.settings.validityOptions.map((o) => <option key={o} value={o}>{o} horas</option>)}
          </select>
        </label>
      )}
      {error && <p className="err">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Liberando…' : 'Liberar partida'}</button>
      <button type="button" className="btn ghost" onClick={p.onAdmin}>Configuração administrativa (PIN do veículo)</button>
      <button type="button" className="btn ghost" onClick={p.onCancel}>Cancelar</button>
    </form>
  );
}

// ======================================================================
function Control(p: {
  session: Session; settings: TenantSettings; link: VehicleLink; vehicle: ActiveVehicle; actingFor?: string; onExit: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusAt, setStatusAt] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [askKm, setAskKm] = useState<{ remaining: number } | null>(null);
  const [kmInput, setKmInput] = useState('');
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const lastSent = useRef<{ at: number; state: string }>({ at: 0, state: '' });
  const partner = !!p.actingFor;

  const apply = useCallback((s: Status) => {
    setStatus(s);
    setStatusAt(Date.now());
    setError(null);
    if (!partner && p.vehicle.releasedAtMs > 0 && s.state !== 'unknown') {
      const now = Date.now();
      if (s.state !== lastSent.current.state || now - lastSent.current.at > 60000) {
        lastSent.current = { at: now, state: s.state };
        insertSnapshot({
          tenant_id: p.session.tenantId, vehicle_id: p.vehicle.vehicleId, driver_code: p.session.driverCode,
          released_at: new Date(p.vehicle.releasedAtMs).toISOString(),
          state: s.state === 'unlocked' ? 'UNLOCKED' : s.state === 'paused' ? 'PAUSED' : 'LOCKED',
          remaining_seconds: s.remainingSeconds,
        });
      }
    }
  }, [p.session, p.vehicle, partner]);

  useEffect(() => {
    (async () => {
      try { await p.link.ensure(); apply(await p.link.status()); }
      catch (e) { setError(errText(e)); }
    })();
    let n = 0;
    const id = setInterval(() => {
      n++;
      setTick((t) => t + 1);
      if (n % 30 === 0 && p.link.connected) p.link.status().then(apply).catch(() => undefined);
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = (() => {
    if (!status) return 0;
    if (status.state !== 'unlocked') return status.remainingSeconds;
    return Math.max(0, status.remainingSeconds - Math.floor((Date.now() - statusAt) / 1000));
  })();

  async function toggle() {
    if (!status || busy) return;
    const cmd = status.state === 'unlocked' ? 'PAUSE' : 'RESUME';
    setBusy(true); setError(null);
    try {
      await p.link.ensure();
      await p.link.sendControl(cmd, p.session.driverCode, p.actingFor);
      await new Promise((r) => setTimeout(r, 400));
      const after = await p.link.status();
      apply(after);
      if (after.state !== (cmd === 'PAUSE' ? 'paused' : 'unlocked')) setError('O veículo não aceitou o comando. Se o tempo acabou, faça uma nova liberação.');
    } catch (e) { setError(errText(e)); }
    setBusy(false);
  }

  async function startUnbind() {
    setConfirmUnbind(false);
    setBusy(true); setError(null);
    try {
      await p.link.ensure();
      const cur = await p.link.status();
      const odo = await p.link.odometerKm();
      if (odo === null) { setAskKm({ remaining: cur.remainingSeconds }); setBusy(false); return; }
      await finishUnbind(cur.remainingSeconds, odo, 'obd');
    } catch (e) { setError(errText(e)); setBusy(false); }
  }

  async function finishUnbind(remainingSeconds: number, endKm: number | null, source: 'obd' | 'manual') {
    setBusy(true); setError(null);
    try {
      await p.link.ensure();
      await p.link.sendControl('UNBIND', p.session.driverCode);
      await new Promise((r) => setTimeout(r, 400));
      const after = await p.link.status();
      if (after.driverId !== '' && after.state !== 'locked') throw new Error('O veículo não confirmou o desvínculo. Tente de novo.');
      await insertTripEnd({
        tenant_id: p.session.tenantId, vehicle_id: p.vehicle.vehicleId, driver_code: p.session.driverCode,
        released_at: new Date(p.vehicle.releasedAtMs).toISOString(), end_odometer_km: endKm,
        odometer_source: source, remaining_seconds: remainingSeconds,
      });
      await creditSet(p.session.tenantId, p.session.driverCode, remainingSeconds);
      clearActive();
      p.onExit();
    } catch (e) { setError(errText(e)); setBusy(false); }
  }

  const on = status?.state === 'unlocked';
  const paused = status?.state === 'paused';
  const caption = !status ? (busy ? 'Conectando ao veículo…' : 'Sem conexão com o veículo.')
    : on ? 'Partida ligada — o tempo está contando.'
    : paused ? 'Partida desligada — o tempo está parado.'
    : 'Veículo livre ou tempo de uso esgotado. Faça uma nova liberação.';

  return (
    <>
      <Ads />
      <p className="center muted">Partida — {p.vehicle.vehicleId}{partner ? ` · em nome de ${p.actingFor} (parceiro)` : ''}</p>
      <button className={`round ${on ? 'on' : paused ? 'off' : 'idle'}`} disabled={busy || !(on || paused)} onClick={toggle}>
        <span style={{ fontSize: 54 }}>{busy ? '…' : on ? '⏻' : '▶'}</span>
        {!busy && (on ? 'DESLIGAR' : paused ? 'LIGAR' : '—')}
      </button>
      <div className="center">
        <div className="muted">Tempo de uso restante</div>
        <div className="big">{status ? fmtHms(remaining) : '--:--:--'}</div>
        <p className="muted">{caption}</p>
      </div>
      {error && <p className="err center">{error}</p>}
      {!status && !busy && <button className="btn ghost" onClick={async () => { setBusy(true); try { await p.link.ensure(); apply(await p.link.status()); } catch (e) { setError(errText(e)); } setBusy(false); }}>Conectar de novo</button>}
      {!partner && (on || paused) && <button className="btn ghost" disabled={busy} onClick={() => setConfirmUnbind(true)}>Encerrar e desvincular</button>}
      <button className="btn ghost" onClick={p.onExit}>Voltar</button>
      <p className="muted center">O tempo só desconta com a partida ligada. Fique perto do veículo (Bluetooth).</p>

      {confirmUnbind && (
        <div className="modal-bg"><div className="modal">
          <b>Encerrar e desvincular?</b>
          <p className="muted">O veículo ficará livre para outro motorista. O tempo que sobrou fica guardado como crédito seu para uma próxima liberação.</p>
          <button className="btn" onClick={startUnbind}>Desvincular</button>
          <button className="btn ghost" onClick={() => setConfirmUnbind(false)}>Cancelar</button>
        </div></div>
      )}
      {askKm && (
        <div className="modal-bg"><div className="modal">
          <b>KM final do veículo</b>
          <p className="muted">Não foi possível ler o hodômetro pela OBD-II. Informe o KM atual do painel.</p>
          <label className="f">KM atual<input inputMode="numeric" value={kmInput} onChange={(e) => setKmInput(e.target.value)} /></label>
          <button className="btn" disabled={!/^\d+$/.test(kmInput)} onClick={() => { const r = askKm.remaining; setAskKm(null); finishUnbind(r, parseInt(kmInput, 10), 'manual'); }}>Confirmar</button>
          {!p.settings.requireFinalKm && <button className="btn ghost" onClick={() => { const r = askKm.remaining; setAskKm(null); finishUnbind(r, null, 'manual'); }}>Pular</button>}
          <button className="btn ghost" onClick={() => setAskKm(null)}>Cancelar</button>
        </div></div>
      )}
    </>
  );
}

// ======================================================================
function Admin({ link, settings, vehicle, onBack }: { link: VehicleLink; settings: TenantSettings; vehicle: Vehicle; onBack: () => void }) {
  const emgOptions = [1, 2, 4, 6].filter((h) => h <= settings.emergencyMaxHours);
  const [hours, setHours] = useState(settings.defaultValidityHours);
  const [emg, setEmg] = useState(emgOptions.includes(settings.emergencyDefaultHours) ? settings.emergencyDefaultHours : (emgOptions[0] ?? 1));
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null);
    try { setMsg({ text: await fn(), err: false }); } catch (e) { setMsg({ text: errText(e), err: true }); }
    setBusy(false);
  }
  return (
    <>
      <b>Configuração — {vehicle.vehicleId}</b>
      <p className="muted">Vale só para este veículo. O PIN administrativo é gravado no próprio ESP32 (não é a senha do painel).</p>
      <label className="f">Tolerância padrão (uso normal)
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{settings.validityOptions.map((o) => <option key={o} value={o}>{o} horas</option>)}</select>
      </label>
      <label className="f">Tolerância do botão de emergência
        <select value={emg} onChange={(e) => setEmg(Number(e.target.value))}>{emgOptions.map((o) => <option key={o} value={o}>{o} hora{o === 1 ? '' : 's'}</option>)}</select>
      </label>
      <label className="f">PIN administrativo do veículo
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
      </label>
      {msg && <p className={msg.err ? 'err' : 'muted'}>{msg.text}</p>}
      <button className="btn" disabled={busy || !pin} onClick={() => run(async () => { await link.ensure(); await link.sendConfig(hours, emg, pin); return 'Configuração enviada.'; })}>Salvar configuração</button>
      <button className="btn ghost" disabled={busy || !pin} onClick={() => run(async () => {
        await link.ensure(); await link.sendAdminUnbind(pin);
        await new Promise((r) => setTimeout(r, 400));
        const st = await link.status();
        if (st.driverId) throw new Error(`O veículo recusou (PIN incorreto?). Vinculado a ${st.driverId}.`);
        return 'Veículo liberado: nenhum motorista vinculado.';
      })}>Liberar veículo (desvincular motorista)</button>
      <button className="btn ghost" onClick={onBack}>Voltar</button>
    </>
  );
}
