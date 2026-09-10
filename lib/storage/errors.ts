/** Best-effort human message from anything a repository can throw. */
export function toStorageErrorMessage(err: unknown, fallback = 'Erro ao acessar os dados.'): string {
  const code = errorCode(err);

  if (code === 'PGRST205') {
    return 'O banco de dados ainda não foi configurado. Aplique a migration do Supabase (supabase/migrations) e recarregue a página.';
  }
  if (code === '42P01') {
    return 'Tabelas do Supabase não encontradas. Rode a migration em supabase/migrations.';
  }
  if (code === 'PGRST301' || code === '401' || code === 'PGRST302') {
    return 'Sessão inválida. Saia e entre novamente.';
  }

  if (err instanceof Error && err.message) return err.message;
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
    if (typeof code === 'number') return String(code);
  }
  return '';
}
