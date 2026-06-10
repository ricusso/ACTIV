const nodemailer = require('nodemailer');

let cachedTransport = null;
let cachedMode = null;

function getAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function getMailFrom() {
  return process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@aktiv.local';
}

function getTransport() {
  if (cachedMode) {
    return { transport: cachedTransport, mode: cachedMode };
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    cachedTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    cachedMode = 'gmail';
    return { transport: cachedTransport, mode: cachedMode };
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn('WARN: GMAIL_USER/GMAIL_APP_PASSWORD не заданы — email verification отключена, регистрация будет автоматически активировать аккаунты.');
    cachedTransport = null;
    cachedMode = 'disabled';
    return { transport: cachedTransport, mode: cachedMode };
  }

  cachedTransport = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
  cachedMode = 'preview';
  return { transport: cachedTransport, mode: cachedMode };
}

async function sendVerificationEmail({ req, to, username, token }) {
  const { transport, mode } = getTransport();
  const verificationUrl = `${getAppBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  if (mode === 'disabled' || !transport) {
    return { mode: 'disabled', verificationUrl: null };
  }

  const mail = {
    from: getMailFrom(),
    to,
    subject: 'Подтвердите почту в АКТИВ',
    text: [
      `Здравствуйте, ${username}!`,
      '',
      'Подтвердите ваш email для входа в АКТИВ:',
      verificationUrl,
      '',
      'Ссылка действует 60 минут.',
      'Если вы не регистрировались, просто проигнорируйте это письмо.'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#16161c;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;color:#16161c;">Подтвердите почту в АКТИВ</h2>
        <p style="margin:0 0 16px;">Здравствуйте, <strong>${username}</strong>!</p>
        <p style="margin:0 0 20px;">Чтобы завершить регистрацию, подтвердите ваш email.</p>
        <p style="margin:0 0 24px;">
          <a href="${verificationUrl}" style="display:inline-block;padding:14px 22px;background:#e8a8d8;color:#111;text-decoration:none;border-radius:12px;font-weight:700;">
            Подтвердить почту
          </a>
        </p>
        <p style="margin:0 0 10px;">Если кнопка не работает, откройте ссылку вручную:</p>
        <p style="margin:0 0 16px;word-break:break-all;"><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p style="margin:0;color:#666;">Ссылка действует 60 минут. Если это были не вы, просто проигнорируйте письмо.</p>
      </div>
    `
  };

  const info = await transport.sendMail(mail);
  if (mode === 'preview') {
    console.log('Email preview:', info.message.toString());
    console.log('Verification URL:', verificationUrl);
  }

  return {
    mode,
    verificationUrl: mode === 'preview' ? verificationUrl : null
  };
}

module.exports = {
  sendVerificationEmail,
  getAppBaseUrl
};
