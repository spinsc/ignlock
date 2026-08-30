import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase, type SponsorAd } from '../lib/supabaseClient';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

function statusOf(ad: SponsorAd): { label: string; pill: string } {
  const now = Date.now();
  if (!ad.active) return { label: 'inativo', pill: 'pill-off' };
  if (ad.starts_at && new Date(ad.starts_at).getTime() > now) return { label: 'agendado', pill: 'pill-off' };
  if (ad.ends_at && new Date(ad.ends_at).getTime() < now) return { label: 'expirado', pill: 'pill-off' };
  return { label: 'no ar', pill: 'pill-ok' };
}

/**
 * Área de patrocinadores: anúncios pagos de fornecedores (ex.: LEDFLEX —
 * barras de LED, sinalização, grades para viaturas) exibidos aqui no painel
 * e, de forma mais discreta, na tela inicial do app do motorista. Único
 * conteúdo do schema com leitura pública (ver migração create_sponsor_ads).
 */
export function SponsorsPanel() {
  const [ads, setAds] = useState<SponsorAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SponsorAd | 'new' | null>(null);

  function load() {
    setLoading(true);
    supabase
      .from('sponsor_ads')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAds((data ?? []) as SponsorAd[]);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function handleSave(e: FormEvent<HTMLFormElement>, imageFile: File | null, existing: SponsorAd | null) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    let imageUrl = existing?.image_url ?? '';
    if (imageFile) {
      const path = `${crypto.randomUUID()}-${imageFile.name}`;
      const { error: upErr } = await supabase.storage.from('sponsor-ads').upload(path, imageFile);
      if (upErr) { setError(`Falha ao enviar imagem: ${upErr.message}`); return; }
      imageUrl = supabase.storage.from('sponsor-ads').getPublicUrl(path).data.publicUrl;
    }
    if (!imageUrl) { setError('Envie uma imagem para o criativo do anúncio.'); return; }

    const payload = {
      sponsor_name: String(form.get('sponsor_name') ?? '').trim(),
      headline: String(form.get('headline') ?? '').trim() || null,
      image_url: imageUrl,
      link_url: String(form.get('link_url') ?? '').trim() || null,
      target_audience: String(form.get('target_audience') ?? '').trim() || null,
      weight: Number(form.get('weight')) || 1,
      active: form.get('active') === 'on',
      starts_at: form.get('starts_at') ? new Date(String(form.get('starts_at'))).toISOString() : null,
      ends_at: form.get('ends_at') ? new Date(String(form.get('ends_at'))).toISOString() : null,
    };

    const { error } = existing
      ? await supabase.from('sponsor_ads').update(payload).eq('id', existing.id)
      : await supabase.from('sponsor_ads').insert(payload);

    if (error) { setError(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(ad: SponsorAd) {
    setError(null);
    const { error } = await supabase.from('sponsor_ads').delete().eq('id', ad.id);
    if (error) { setError(error.message); return; }
    setAds((prev) => prev.filter((a) => a.id !== ad.id));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Patrocinadores</h2>
          <p className="panel-sub">
            Anúncios pagos de fornecedores relevantes para a frota (ex.: barras de LED, sinalização, grades —
            LEDFLEX e afins). Aparecem aqui no painel e, de forma discreta, na tela inicial do app do motorista.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" onClick={() => setEditing('new')}>Novo anúncio</button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Patrocinador</th>
              <th>Chamada</th>
              <th>Público-alvo</th>
              <th>Peso</th>
              <th>Período</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => {
              const s = statusOf(ad);
              return (
                <tr key={ad.id}>
                  <td>
                    <img src={ad.image_url} alt={ad.sponsor_name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                  </td>
                  <td>{ad.sponsor_name}</td>
                  <td>{ad.headline ?? '—'}</td>
                  <td className="mono">{ad.target_audience ?? '—'}</td>
                  <td className="num">{ad.weight}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDate(ad.starts_at)} – {formatDate(ad.ends_at)}</td>
                  <td><span className={`pill ${s.pill}`}>{s.label}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="ghost" onClick={() => setEditing(ad)}>Editar</button>
                    <button type="button" className="ghost" onClick={() => remove(ad)}>Excluir</button>
                  </td>
                </tr>
              );
            })}
            {ads.length === 0 && (
              <tr><td colSpan={8} className="muted">Nenhum anúncio cadastrado ainda.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {editing && (
        <SponsorAdDialog
          ad={editing === 'new' ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          error={error}
        />
      )}
    </section>
  );
}

function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : '';
}

function SponsorAdDialog({
  ad,
  onSave,
  onClose,
  error,
}: {
  ad: SponsorAd | null;
  onSave: (e: FormEvent<HTMLFormElement>, imageFile: File | null, existing: SponsorAd | null) => void;
  onClose: () => void;
  error: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{ad ? `Editar anúncio — ${ad.sponsor_name}` : 'Novo anúncio de patrocinador'}</h3>
        <form
          onSubmit={(e) => onSave(e, fileRef.current?.files?.[0] ?? null, ad)}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input name="sponsor_name" defaultValue={ad?.sponsor_name ?? ''} placeholder="Nome do patrocinador (ex.: LEDFLEX)" required />
          <input name="headline" defaultValue={ad?.headline ?? ''} placeholder="Chamada (ex.: Barras de LED para viaturas)" />
          <input name="link_url" type="url" defaultValue={ad?.link_url ?? ''} placeholder="Link ao tocar/clicar (opcional) — https://…" />
          <input name="target_audience" defaultValue={ad?.target_audience ?? ''} placeholder="Público-alvo (opcional, ex.: seguranca_publica)" />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span className="muted" style={{ padding: 0 }}>Criativo (imagem){ad ? ' — deixe em branco para manter a atual' : ''}</span>
            <input ref={fileRef} name="image" type="file" accept="image/*" required={!ad} />
          </label>
          {ad && (
            <img src={ad.image_url} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: 'var(--paper)', borderRadius: 3 }} />
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
              <span className="muted" style={{ padding: 0 }}>Início (opcional)</span>
              <input name="starts_at" type="date" defaultValue={toDateInputValue(ad?.starts_at ?? null)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, flex: 1 }}>
              <span className="muted" style={{ padding: 0 }}>Fim (opcional)</span>
              <input name="ends_at" type="date" defaultValue={toDateInputValue(ad?.ends_at ?? null)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, width: 90 }}>
              <span className="muted" style={{ padding: 0 }}>Peso</span>
              <input name="weight" type="number" min={1} defaultValue={ad?.weight ?? 1} />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input name="active" type="checkbox" defaultChecked={ad?.active ?? true} style={{ width: 'auto' }} />
            Anúncio ativo
          </label>

          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit">{ad ? 'Salvar alterações' : 'Publicar anúncio'}</button>
            <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
