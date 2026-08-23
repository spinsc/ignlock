/// Credenciais do backend IGNLOCK (projeto Supabase "ignlock").
///
/// A chave abaixo é a chave PUBLICÁVEL (publishable/anon) — ela é destinada
/// a ficar embutida em apps cliente e não precisa ser tratada como segredo:
/// toda a segurança de acesso é garantida pelas políticas de RLS no banco
/// (o app só tem permissão de INSERT em trip_logs, nunca de leitura — ver
/// a migração `initial_ignlock_schema` no projeto Supabase).
class SupabaseConfig {
  static const String url = 'https://proidvvzhzegvlohmguf.supabase.co';
  static const String anonKey = 'sb_publishable_M_HFYVOWgQSO9HWXCpZvPg_wPpi2ym5';
}
