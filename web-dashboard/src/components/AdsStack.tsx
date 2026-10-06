import { useEffect, useState } from 'react';
import { supabase, type SponsorAd } from '../lib/supabaseClient';

/** Anúncios de apoiadores (globais da ACN), empilhados no topo do painel. */
export function AdsStack() {
  const [ads, setAds] = useState<SponsorAd[]>([]);

  useEffect(() => {
    supabase
      .from('sponsor_ads')
      .select('*')
      .eq('active', true)
      .order('weight', { ascending: false })
      .then(({ data }) => {
        const now = Date.now();
        setAds(
          ((data ?? []) as SponsorAd[]).filter(
            (a) =>
              (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
              (!a.ends_at || new Date(a.ends_at).getTime() >= now)
          )
        );
      });
  }, []);

  if (ads.length === 0) return null;
  return (
    <div className="ads-stack">
      {ads.map((ad) => {
        const body = (
          <>
            <img src={ad.image_url} alt={ad.sponsor_name} />
            <span className="ads-text">
              <b>{ad.headline ?? ad.sponsor_name}</b>
              <small>Patrocinado · {ad.sponsor_name}</small>
            </span>
          </>
        );
        return ad.link_url ? (
          <a key={ad.id} className="ads-row" href={ad.link_url} target="_blank" rel="noopener noreferrer">{body}</a>
        ) : (
          <div key={ad.id} className="ads-row">{body}</div>
        );
      })}
    </div>
  );
}
