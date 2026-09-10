/**
 * Supabase connection values, read from `NEXT_PUBLIC_*` env vars (inlined at
 * build time). The lookup is a function, not a module constant, so importing a
 * Supabase client module never throws — the clear error only fires when code
 * actually tries to talk to Supabase without configuration.
 */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // "Publishable key" is the current name; the legacy "anon" key still works.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local (veja .env.example).',
    );
  }

  return { url, key };
}
