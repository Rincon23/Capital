import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  gmailAlertNotification,
  isReceivedMail,
  matchKeywords,
  normalizeKeyword,
  sameKeyword,
  senderName,
} from '../index';

describe('matchKeywords', () => {
  const email = {
    subject: 'Sua fatura de SETEMBRO',
    from: 'Banco Exemplo <cobranca@banco.com>',
    snippet: 'O boleto vence amanhã. Não é spam.',
  };

  it('looks in the subject, the sender and the preview, ignoring case and accents', () => {
    expect(matchKeywords(email, ['fatura', 'Cobrança', 'VENCE AMANHA', 'pix'])).toEqual([
      'fatura',
      'Cobrança',
      'VENCE AMANHA',
    ]);
  });

  it('matches inside words, like the bot did', () => {
    expect(matchKeywords(email, ['bol'])).toEqual(['bol']);
  });

  it('lists a keyword once even if it is repeated with other spellings', () => {
    expect(matchKeywords(email, ['boleto', 'Boleto '])).toEqual(['boleto']);
  });

  it('ignores empty keywords', () => {
    expect(matchKeywords(email, ['  '])).toEqual([]);
  });
});

describe('helpers', () => {
  it('decodes the entities of Gmail previews', () => {
    expect(decodeEntities('Don&#39;t miss R&amp;D &quot;hoje&quot; &#x2764; &nbsp;fim &foo;')).toBe(
      'Don\'t miss R&D "hoje" ❤  fim &foo;',
    );
  });

  it('normalizes and compares keywords', () => {
    expect(normalizeKeyword('  nota   fiscal ')).toBe('nota fiscal');
    expect(sameKeyword('Cobrança', 'COBRANCA ')).toBe(true);
    expect(sameKeyword('boleto', 'boletos')).toBe(false);
  });

  it('takes the name from the sender', () => {
    expect(senderName('Banco Exemplo <avisos@banco.com>')).toBe('Banco Exemplo');
    expect(senderName('"Loja, Ltda" <x@y.com>')).toBe('Loja, Ltda');
    expect(senderName('<x@y.com>')).toBe('x@y.com');
    expect(senderName('x@y.com')).toBe('x@y.com');
  });

  it('skips sent mail, drafts, spam and the bin', () => {
    expect(isReceivedMail(['INBOX', 'CATEGORY_UPDATES'])).toBe(true);
    expect(isReceivedMail([])).toBe(true);
    expect(isReceivedMail(['SENT'])).toBe(false);
    expect(isReceivedMail(['TRASH'])).toBe(false);
  });
});

describe('gmailAlertNotification', () => {
  it('names the keyword, the sender and the subject, and opens the e-mail in the right account', () => {
    expect(
      gmailAlertNotification({ id: 'abc', subject: '', from: 'Loja <l@x.com>' }, ['pedido'], 'eu@gmail.com'),
    ).toEqual({
      title: '📩 E-mail com "pedido"',
      body: 'Loja: (sem assunto)',
      url: 'https://mail.google.com/mail/u/eu%40gmail.com/#all/abc',
      tag: 'gmail-abc',
    });
  });
});
