import type { PushMessage } from '../notifications/types';
import { foldText } from '../ai/text';
import type { GmailMessageSummary } from './types';

/**
 * The Gmail monitor's rules (bot spec §4.12, correction 13), with no I/O: which keywords an
 * e-mail contains and the one notification it becomes.
 */

/** Labels of mail the user didn't receive: what they sent, drafts, spam and the bin. */
const IGNORED_LABELS = new Set(['SENT', 'DRAFT', 'SPAM', 'TRASH', 'CHAT']);

export function isReceivedMail(labelIds: string[]): boolean {
  return !labelIds.some((label) => IGNORED_LABELS.has(label));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Gmail's snippet comes HTML-escaped ("Don&#39;t", "R&amp;D"). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 ? String.fromCodePoint(value) : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** A keyword as stored: trimmed, inner spaces collapsed. */
export function normalizeKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, ' ').trim();
}

/** Two keywords that would match the same e-mails ("Boleto" and "boleto "). */
export function sameKeyword(a: string, b: string): boolean {
  return foldText(normalizeKeyword(a)) === foldText(normalizeKeyword(b));
}

/**
 * The keywords found in the subject, the sender or the preview, in the user's order. Like the
 * bot, a keyword matches anywhere inside the text, ignoring upper/lower case; accents are
 * ignored too, so "cobrança" also finds "COBRANCA".
 */
export function matchKeywords(
  message: Pick<GmailMessageSummary, 'subject' | 'from' | 'snippet'>,
  keywords: string[],
): string[] {
  const haystack = foldText([message.subject, message.from, message.snippet].join('\n'));
  const found: string[] = [];
  for (const keyword of keywords) {
    const needle = foldText(normalizeKeyword(keyword));
    if (!needle || !haystack.includes(needle)) continue;
    if (!found.some((other) => sameKeyword(other, keyword))) found.push(keyword);
  }
  return found;
}

/** "Banco X <avisos@x.com>" → "Banco X"; a bare address stays as it is. */
export function senderName(from: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return from.trim();
  return match[1].trim() || match[2].trim();
}

/** Opens the e-mail in Gmail, in the right account even when several are signed in. */
export function gmailMessageUrl(accountEmail: string, messageId: string): string {
  return `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${messageId}`;
}

/** One notification per e-mail, naming every keyword it contains. */
export function gmailAlertNotification(
  message: Pick<GmailMessageSummary, 'id' | 'subject' | 'from'>,
  keywords: string[],
  accountEmail: string,
): PushMessage {
  const title =
    keywords.length === 1
      ? `📩 E-mail com "${keywords[0]}"`
      : `📩 E-mail com ${keywords.length} palavras-chave`;
  const subject = message.subject.trim() || '(sem assunto)';
  const lines = [`${senderName(message.from)}: ${subject}`];
  if (keywords.length > 1) lines.push(`Palavras: ${keywords.join(', ')}`);
  return {
    title,
    body: lines.join('\n'),
    url: gmailMessageUrl(accountEmail, message.id),
    tag: `gmail-${message.id}`,
  };
}
