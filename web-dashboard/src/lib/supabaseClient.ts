import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidos em .env.local (ver .env.example).'
  );
}

export const supabase = createClient(url, anonKey);

export type Vehicle = {
  id: string;
  vehicle_id: string;
  ble_mac: string;
  plate: string | null;
  model: string | null;
  active: boolean;
  created_at: string;
};

export type Driver = {
  id: string;
  driver_code: string;
  full_name: string;
  active: boolean;
  created_at: string;
};

export type TripLog = {
  id: string;
  vehicle_id: string;
  driver_code: string;
  odometer_km: number;
  destination: string;
  valid_hours: number;
  released_at: string;
  expires_at: string;
  synced_at: string;
};
