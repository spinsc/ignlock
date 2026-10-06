import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile, type Tenant } from '../lib/supabaseClient';

/** Perfil + empresa (tenant) ativa do usuário logado. */
export function useProfile(session: Session) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]); // só o superadmin enxerga mais de uma
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      const prof = p as Profile | null;
      const { data: ts } = await supabase.from('tenants').select('*').order('name');
      if (cancelled) return;
      const list = (ts ?? []) as Tenant[];
      setProfile(prof);
      setTenants(list);
      setTenant(list.find((t) => t.id === prof?.tenant_id) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session.user.id]);

  const isSuperadmin = profile?.role === 'superadmin';
  return { profile, tenant, tenants, loading, isSuperadmin, isAdmin: profile?.role === 'admin' || isSuperadmin };
}
