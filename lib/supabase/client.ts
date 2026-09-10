import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabaseEnv } from './env';

let client: SupabaseClient<Database> | undefined;

/**
 * Supabase client for the browser / Client Components. A lazily-created
 * singleton so the whole app shares one auth state and one realtime connection.
 * Never call this during SSR of a Client Component — the repository only touches
 * it from effects and event handlers.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
