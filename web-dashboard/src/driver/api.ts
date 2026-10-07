import { createClient } from '@supabase/supabase-js';

// Cliente SEM sessão do Supabase Auth: o motorista entra por e-mail/senha
// validados no servidor (RPC driver_login), igual ao app Android. A chave é a
// anônima; por isso nenhum insert aqui encadeia .select() (sem permissão de leitura).
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const db = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export type TenantSettings = {
  validityOptions: number[];
  defaultValidityHours: number;
  emergencyDefaultHours: number;
  emergencyMaxHours: number;
  requireFinalKm: boolean;
  allowPartner: boolean;
  brandColor: string | null;
  logoUrl: string | null;
};

export const DEFAULT_SETTINGS: TenantSettings = {
  validityOptions: [4, 8, 12, 24, 48],
  defaultValidityHours: 12,
  emergencyDefaultHours: 1,
  emergencyMaxHours: 6,
  requireFinalKm: true,
  allowPartner: true,
  brandColor: null,
  logoUrl: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSettings(j: any): TenantSettings {
  if (!j) return DEFAULT_SETTINGS;
  const opts: number[] = Array.isArray(j.validity_options) && j.validity_options.length ? j.validity_options.map(Number) : DEFAULT_SETTINGS.validityOptions;
  let def = Number(j.default_validity_hours ?? DEFAULT_SETTINGS.defaultValidityHours);
  if (!opts.includes(def)) def = opts[0];
  return {
    validityOptions: opts,
    defaultValidityHours: def,
    emergencyDefaultHours: Number(j.emergency_default_hours ?? DEFAULT_SETTINGS.emergencyDefaultHours),
    emergencyMaxHours: Number(j.emergency_max_hours ?? DEFAULT_SETTINGS.emergencyMaxHours),
    requireFinalKm: j.require_final_km ?? DEFAULT_SETTINGS.requireFinalKm,
    allowPartner: j.allow_partner ?? DEFAULT_SETTINGS.allowPartner,
    brandColor: /^#[0-9a-fA-F]{6}$/.test(j.brand_color ?? '') ? j.brand_color : null,
    logoUrl: j.logo_url ?? null,
  };
}

export type Tenant = { id: string; name: string; settings: TenantSettings };
export type PartnerLink = { vehicleId: string; officialDriverCode: string };
export type Ad = { id: string; sponsor_name: string; headline: string | null; image_url: string; link_url: string | null; weight: number };

export async function resolveTenant(company: string): Promise<Tenant | null> {
  const { data, error } = await db.rpc('resolve_tenant', { p_name: company.trim() });
  if (error || !data || data.length === 0) return null;
  const info = await tenantInfo(data[0].id);
  return info ?? { id: data[0].id, name: data[0].name, settings: DEFAULT_SETTINGS };
}

export async function tenantInfo(id: string): Promise<Tenant | null> {
  const { data, error } = await db.rpc('tenant_info', { p_tenant: id });
  if (error || !data) return null;
  return { id: data.id, name: data.name, settings: parseSettings(data.settings) };
}

export type LoginOutcome =
  | { status: 'ok'; driverCode: string; fullName: string }
  | { status: 'invalid' | 'locked' | 'offline' };

export async function driverLogin(tenantId: string, email: string, password: string): Promise<LoginOutcome> {
  try {
    const { data, error } = await db.rpc('driver_login', { p_tenant: tenantId, p_email: email.trim(), p_password: password });
    if (error) return { status: 'offline' };
    const r = data?.[0];
    if (!r) return { status: 'invalid' };
    if (r.status === 'ok') return { status: 'ok', driverCode: r.driver_code, fullName: r.full_name };
    return { status: r.status === 'locked' ? 'locked' : 'invalid' };
  } catch {
    return { status: 'offline' };
  }
}

export async function isDriverActive(tenantId: string, code: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('driver_is_active', { p_tenant: tenantId, p_code: code });
    return error ? true : data === true; // sem internet mantém a sessão
  } catch {
    return true;
  }
}

export async function partnerLinks(tenantId: string, code: string): Promise<PartnerLink[] | null> {
  const { data, error } = await db.rpc('driver_partner_links', { p_tenant: tenantId, p_code: code });
  if (error || !data) return null;
  return data.map((r: { vehicle_id: string; official_driver_code: string }) => ({ vehicleId: r.vehicle_id, officialDriverCode: r.official_driver_code }));
}

export async function creditGet(tenantId: string, code: string): Promise<number> {
  const { data } = await db.rpc('driver_credit_get', { p_tenant: tenantId, p_code: code });
  return Number(data ?? 0);
}
export async function creditSet(tenantId: string, code: string, seconds: number): Promise<boolean> {
  const { error } = await db.rpc('driver_credit_set', { p_tenant: tenantId, p_code: code, p_seconds: Math.max(0, Math.round(seconds)) });
  return !error;
}

export async function resolveVehicleBySuffix(tenantId: string, suffix: string): Promise<{ vehicleId: string; bleMac: string } | null> {
  const { data } = await db.rpc('resolve_vehicle', { p_tenant: tenantId, p_suffix: suffix });
  const r = data?.[0];
  return r ? { vehicleId: r.vehicle_id, bleMac: r.ble_mac } : null;
}

export async function fetchAds(): Promise<Ad[]> {
  const { data } = await db.from('sponsor_ads').select('id, sponsor_name, headline, image_url, link_url, weight');
  return ((data ?? []) as Ad[]).sort((a, b) => b.weight - a.weight);
}

// ---- gravações (INSERT-only com a chave anônima)
async function insert(table: string, row: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await db.from(table).insert(row);
    return !error;
  } catch {
    return false;
  }
}
export const insertTripLog = (row: Record<string, unknown>) => insert('trip_logs', row);
export const insertEmergency = (row: Record<string, unknown>) => insert('emergency_events', row);
export const insertSnapshot = (row: Record<string, unknown>) => insert('usage_snapshots', row);
export const insertTripEnd = (row: Record<string, unknown>) => insert('trip_ends', row);
