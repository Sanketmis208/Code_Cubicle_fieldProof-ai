import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Outgoing email over SMTP (any provider: Resend, Postmark, SES, Gmail with an
 * app password). When SMTP is not configured, mail is not sent: the caller
 * gets `sent: false` and shows the link to the admin to pass on by hand, so a
 * demo or a first deploy never blocks on an email provider.
 */
let transporter: Transporter | null = null;
function transport() {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Captured mail for tests and for the dev server's console. */
export const outbox: Mail[] = [];

export const mailService = {
  isConfigured: () => Boolean(transport()),

  async send(mail: Mail): Promise<{ sent: boolean }> {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    const smtp = transport();
    if (!smtp) {
      if (env.NODE_ENV !== 'test') console.log(`[mail not configured] to ${mail.to}: ${mail.subject}\n${mail.text}`);
      return { sent: false };
    }
    try {
      await smtp.sendMail({ from: env.SMTP_FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
      return { sent: true };
    } catch (error) {
      console.error('Mail delivery failed:', error instanceof Error ? error.message : error);
      return { sent: false };
    }
  },
};

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function layout(title: string, lines: string[], action: { label: string; url: string }) {
  const body = lines.map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#10211c">${escape(line)}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f2f0e8;font-family:Helvetica,Arial,sans-serif;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:32px">
<p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:.2em;color:#60706a">FIELDPROOF AI</p>
<h1 style="margin:0 0 18px;font-size:24px;color:#0b1714">${escape(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#0b1714;color:#b9f459;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${escape(action.label)}</a></p>
<p style="font-size:12px;color:#60706a;line-height:1.6">If the button does not work, open this address:<br>${escape(action.url)}</p>
</div></body></html>`;
}

export function accountSetupMail(input: { to: string; name: string; organization: string; role: string; url: string; invitedBy: string }): Mail {
  const lines = [
    `Hi ${input.name},`,
    `${input.invitedBy} has added you to ${input.organization} on FieldProof as ${input.role}.`,
    'Choose a password to activate your account. The link works once and expires in 7 days.',
    'After that, sign in on the web app or the FieldProof mobile app with this email address.',
  ];
  return {
    to: input.to,
    subject: `${input.invitedBy} added you to ${input.organization} on FieldProof`,
    text: `${lines.join('\n\n')}\n\n${input.url}`,
    html: layout(`Welcome to ${input.organization}`, lines, { label: 'Choose your password', url: input.url }),
  };
}

export function addedToOrganizationMail(input: { to: string; name: string; organization: string; role: string; url: string; invitedBy: string }): Mail {
  const lines = [
    `Hi ${input.name},`,
    `${input.invitedBy} has added you to ${input.organization} on FieldProof as ${input.role}.`,
    'Sign in with your existing FieldProof account and switch to this organization from the sidebar.',
  ];
  return {
    to: input.to,
    subject: `You have been added to ${input.organization} on FieldProof`,
    text: `${lines.join('\n\n')}\n\n${input.url}`,
    html: layout(`You are in ${input.organization}`, lines, { label: 'Open FieldProof', url: input.url }),
  };
}

export function passwordResetMail(input: { to: string; name: string; url: string }): Mail {
  const lines = [`Hi ${input.name},`, 'Use the link below to choose a new password. It works once and expires in 2 hours.', 'If you did not ask for this, you can ignore this email.'];
  return {
    to: input.to,
    subject: 'Reset your FieldProof password',
    text: `${lines.join('\n\n')}\n\n${input.url}`,
    html: layout('Reset your password', lines, { label: 'Choose a new password', url: input.url }),
  };
}
