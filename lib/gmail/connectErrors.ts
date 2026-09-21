/**
 * Why "Conectar Gmail" did not work. The server sends the browser back to /gmail?erro=<code> and
 * the screen shows the message for that code — never text taken from the address itself, or a
 * link could make the app display whatever someone wrote in it.
 */
const CONNECT_ERRORS = {
  'nao-configurado': 'O Google ainda não está configurado neste servidor.',
  'modulo-desligado': 'Ligue "Monitor de Gmail" em Mais → Módulos.',
  'inicio-falhou': 'Não foi possível iniciar a conexão com o Google.',
  expirou: 'A conexão expirou ou veio de outro lugar. Toque em "Conectar Gmail" de novo.',
  negado: 'Você não deu a permissão no Google. Nada foi conectado.',
  google: 'O Google não concluiu a conexão. Tente de novo.',
  'sem-autorizacao': 'O Google não devolveu a autorização. Tente de novo.',
  'sem-permissao': 'A permissão de ler os e-mails ficou desmarcada no Google. Conecte de novo e marque-a.',
  falhou: 'Não foi possível concluir a conexão com o Google. Tente de novo.',
} as const;

export type GmailConnectError = keyof typeof CONNECT_ERRORS;

/** The message for a code from the address; anything unknown reads as a generic failure. */
export function gmailConnectErrorMessage(code: string): string {
  return Object.hasOwn(CONNECT_ERRORS, code)
    ? CONNECT_ERRORS[code as GmailConnectError]
    : CONNECT_ERRORS.falhou;
}
