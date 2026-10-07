import {
  DEFAULT_SETTINGS, insertEmergency, insertTripLog,
  type PartnerLink, type TenantSettings,
} from './api';

// Estado local do app web (localStorage): sessão do motorista, empresa lembrada,
// veículo ativo e fila offline de gravações (logs de viagem / emergências).

const K = {
  tenantId: 'ignlock.tenant_id',
  tenantName: 'ignlock.tenant_name',
  settings: 'ignlock.settings',
  partners: 'ignlock.partners',
  driverCode: 'ignlock.driver_code',
  driverName: 'ignlock.driver_name',
  active: 'ignlock.active_vehicle',
  queue: 'ignlock.queue',
};

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignora */ } };
const json = <T,>(k: string, fallback: T): T => { try { const v = get(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };

export type Session = { tenantId: string; tenantName: string; driverCode: string; fullName: string };
export type ActiveVehicle = { vehicleId: string; bleMac: string; releasedAtMs: number; validHours: number };

export function loadSession(): Session | null {
  const tenantId = get(K.tenantId), tenantName = get(K.tenantName), driverCode = get(K.driverCode), fullName = get(K.driverName);
  return tenantId && tenantName && driverCode && fullName ? { tenantId, tenantName, driverCode, fullName } : null;
}
export function saveTenant(id: string, name: string, settings: TenantSettings) {
  set(K.tenantId, id); set(K.tenantName, name); set(K.settings, JSON.stringify(settings));
}
export function savedTenant(): { id: string; name: string } | null {
  const id = get(K.tenantId), name = get(K.tenantName);
  return id && name ? { id, name } : null;
}
export function forgetTenant() { [K.tenantId, K.tenantName, K.settings, K.partners].forEach(del); }
export function saveDriver(code: string, name: string) { set(K.driverCode, code); set(K.driverName, name); }
export function logout() { del(K.driverCode); del(K.driverName); del(K.active); }

export const loadSettings = (): TenantSettings => ({ ...DEFAULT_SETTINGS, ...json<Partial<TenantSettings>>(K.settings, {}) });
export const saveSettings = (s: TenantSettings) => set(K.settings, JSON.stringify(s));
export const loadPartners = (): PartnerLink[] => json<PartnerLink[]>(K.partners, []);
export const savePartners = (p: PartnerLink[]) => set(K.partners, JSON.stringify(p));

export const loadActive = (): ActiveVehicle | null => json<ActiveVehicle | null>(K.active, null);
export const saveActive = (a: ActiveVehicle) => set(K.active, JSON.stringify(a));
export const clearActive = () => del(K.active);

// ---- fila offline
type QueueItem = { kind: 'trip_log' | 'emergency'; row: Record<string, unknown> };
const loadQueue = () => json<QueueItem[]>(K.queue, []);

export function enqueue(item: QueueItem) {
  set(K.queue, JSON.stringify([...loadQueue(), item]));
}

/** Tenta enviar tudo que ficou pendente; devolve quantos subiram. */
export async function flushQueue(): Promise<number> {
  const q = loadQueue();
  const rest: QueueItem[] = [];
  let sent = 0;
  for (const it of q) {
    const ok = it.kind === 'trip_log' ? await insertTripLog(it.row) : await insertEmergency(it.row);
    if (ok) sent++; else rest.push(it);
  }
  set(K.queue, JSON.stringify(rest));
  return sent;
}
