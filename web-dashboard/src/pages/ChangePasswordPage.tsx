import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Exibida obrigatoriamente quando user_metadata.must_change_password === true
 * (definido na criação da conta admin — ver README do painel).
 */
export function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="kicker">PRIMEIRO ACESSO</span>
        <h1>Defina sua senha</h1>
        <p className="login-hint" style={{ marginTop: -8, marginBottom: 8 }}>
          Por segurança, troque a senha inicial antes de continuar.
        </p>
        <label>
          Nova senha
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Confirmar nova senha
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </form>
    </div>
  );
}
