import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import './App.css';

export default function App() {
  const { session, loading } = useAuth();

  if (loading) return <div className="boot-screen">Carregando…</div>;
  if (!session) return <LoginPage />;
  if (session.user.user_metadata?.must_change_password) return <ChangePasswordPage />;

  return <DashboardPage session={session} />;
}
