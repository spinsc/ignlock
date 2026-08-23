import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabaseClient';

/** Perfil (role) do usuário logado — usado para mostrar/esconder ações de admin. */
export function useProfile(session: Session) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          setProfile(data as Profile | null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [session.user.id]);

  return { profile, loading, isAdmin: profile?.role === 'admin' };
}
