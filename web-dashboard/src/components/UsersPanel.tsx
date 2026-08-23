import { useEffect, useState, type FormEvent } from 'react';
import { supabase, type Profile, type Role } from '../lib/supabaseClient';

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function UsersPanel({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newPassword, setNewPassword] = useState(randomPassword());
  const [creating, setCreating] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setUsers((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCreatedInfo(null);
    setCreating(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email')).trim();
    const full_name = String(form.get('full_name') || '').trim();
    const role = String(form.get('role')) as Role;

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email, full_name: full_name || null, role, password: newPassword },
    });

    setCreating(false);

    if (error) {
      setError(error.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }

    setCreatedInfo(
      `Conta criada para ${email}. Senha inicial: ${newPassword} (o usuário será obrigado a trocá-la no primeiro login — anote e envie por um canal seguro, ela não aparece de novo).`
    );
    (e.target as HTMLFormElement).reset();
    setNewPassword(randomPassword());
    setShowForm(false);
    load();
  }

  async function handleRoleChange(profile: Profile, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id);
    if (error) setError(error.message);
    else load();
  }

  if (!isAdmin) {
    return (
      <section className="panel">
        <h2>Usuários</h2>
        <p className="panel-sub">Apenas administradores podem gerenciar usuários do painel.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Usuários do Painel</h2>
          <p className="panel-sub">Contas de acesso ao painel, com perfil admin (gestão completa) ou operador (sem gestão de usuários).</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Novo usuário'}</button>
      </div>

      {createdInfo && <p className="muted" style={{ padding: 0, textAlign: 'left' }}>{createdInfo}</p>}

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input name="email" type="email" placeholder="E-mail" required style={{ flex: 1, minWidth: 200 }} />
            <input name="full_name" placeholder="Nome (opcional)" style={{ flex: 1, minWidth: 160 }} />
            <select name="role" defaultValue="operator" style={{ padding: '9px 11px', borderRadius: 3, border: '1px solid var(--border)' }}>
              <option value="operator">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="muted" style={{ padding: 0 }}>Senha inicial:</span>
            <code className="mono">{newPassword}</code>
            <button type="button" className="ghost" onClick={() => setNewPassword(randomPassword())}>Gerar outra</button>
          </div>
          <button type="submit" disabled={creating} style={{ alignSelf: 'flex-start' }}>
            {creating ? 'Criando…' : 'Criar usuário'}
          </button>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Perfil</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.email}</td>
                <td>{u.full_name ?? '—'}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                    style={{ padding: '5px 8px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--ink)' }}
                  >
                    <option value="operator">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">Nenhum usuário cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
