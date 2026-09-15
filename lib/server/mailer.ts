import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transporter: Transporter | undefined;

/** SMTP from the env (Gmail: smtp.gmail.com:465 with an app password). Null when not configured. */
function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends an e-mail. Without SMTP configured (local development) the message is printed to
 * the server log instead, so confirmation and reset links can still be followed.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const smtp = getTransporter();
  if (!smtp) {
    console.info(`[e-mail — SMTP não configurado] Para: ${mail.to}\n${mail.subject}\n\n${mail.text}`);
    return;
  }
  await smtp.sendMail({
    from: process.env.MAIL_FROM || `Capital <${process.env.SMTP_USER}>`,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
}

export function confirmEmailMessage(to: string, url: string): Mail {
  return {
    to,
    subject: 'Confirme seu e-mail no Capital',
    text:
      'Olá!\n\nPara ativar sua conta no Capital, abra o link abaixo:\n\n' +
      `${url}\n\nO link vale por 1 hora. Se você não criou uma conta, ignore este e-mail.`,
  };
}

export function resetPasswordMessage(to: string, url: string): Mail {
  return {
    to,
    subject: 'Redefinir sua senha do Capital',
    text:
      'Olá!\n\nRecebemos um pedido para redefinir a senha da sua conta no Capital. ' +
      `Para escolher uma nova senha, abra o link abaixo:\n\n${url}\n\n` +
      'O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.',
  };
}
