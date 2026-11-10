import 'server-only';

/**
 * The Invest + (the investments app the Diagrama moved to on 2026-11-09): where the old address of
 * the Diagrama and the notice about the move send the person. INVEST_URL overrides it.
 */
export function investUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.INVEST_URL?.trim() || 'https://invest.rincon.dev.br').replace(/\/+$/, '');
}
