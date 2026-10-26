/**
 * Why "Conectar Gmail" did not work. The server sends the browser back to /gmail?erro=<code> and
 * the screen shows the message for that code — never text taken from the address itself, or a
 * link could make the app display whatever someone wrote in it.
 */
const CONNECT_ERRORS = {
  'nao-configurado': 'O Google ainda não está configurado neste servidor.',
  indisponivel: 'O Monitor de Gmail não está disponível.',
  'inicio-falhou': 'Não foi possível iniciar a conexão com o Google.',
  expirou: 'A conexão expirou. Toque em "Conectar Gmail" de novo.',
  negado: 'Você não deu a permissão no Google. Nada foi conectado.',
  google: 'O Google não concluiu a conexão. Tente de novo.',
  'sem-autorizacao': 'O Google não devolveu a autorização. Tente de novo.',
  'sem-permissao': 'Faltou marcar a permissão de ler e-mails. Conecte de novo.',
  falhou: 'Não deu para conectar ao Google. Tente de novo.',
} as const;

export type GmailConnectError = keyof typeof CONNECT_ERRORS;

/** The message for a code from the address; anything unknown reads as a generic failure. */
export function gmailConnectErrorMessage(code: string): string {
  return Object.hasOwn(CONNECT_ERRORS, code)
    ? CONNECT_ERRORS[code as GmailConnectError]
    : CONNECT_ERRORS.falhou;
}
