import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src={`${import.meta.env.BASE_URL}acn-logo.png`} alt="ACN Sinal Verde" />
        <span className="kicker">IGNLOCK · PAINEL DA FROTA</span>
        <h1>Entrar</h1>
        <label>
          E-mail
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Senha
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        <p className="login-hint">
          Sua empresa ainda não usa o IGNLOCK?{' '}
          <button type="button" className="link" onClick={() => setRequesting(true)}>Solicitar acesso</button>
        </p>
      </form>
      {requesting && <RequestAccessDialog onClose={() => setRequesting(false)} />}
    </div>
  );
}

function RequestAccessDialog({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    // Sem .select(): a chave anônima só tem INSERT em tenant_requests.
    const { error } = await supabase.from('tenant_requests').insert({
      company_name: String(f.get('company_name')).trim(),
      contact_name: String(f.get('contact_name')).trim(),
      email: String(f.get('email')).trim(),
      phone: String(f.get('phone') ?? '').trim() || null,
      message: String(f.get('message') ?? '').trim() || null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Solicitar acesso</h3>
        {sent ? (
          <>
            <p>Solicitação enviada. A equipe ACN Sinal Verde analisa e retorna por e-mail com o acesso da sua empresa.</p>
            <button type="button" onClick={onClose}>Fechar</button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input name="company_name" placeholder="Nome da empresa" required minLength={2} />
            <input name="contact_name" placeholder="Seu nome" required minLength={2} />
            <input name="email" type="email" placeholder="E-mail do administrador" required />
            <input name="phone" placeholder="Telefone (opcional)" />
            <input name="message" placeholder="Quantos veículos / observações (opcional)" maxLength={1000} />
            {error && <p className="form-error">{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitação'}</button>
              <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
