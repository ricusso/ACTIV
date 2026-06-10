const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const queries = require('../db/queries');
const { sendVerificationEmail } = require('../utils/mailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function createVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueVerificationEmail(req, user) {
  const rawToken = createVerificationToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await queries.saveEmailVerificationToken(user.id, hashVerificationToken(rawToken), expiresAt);
  return sendVerificationEmail({
    req,
    to: user.email,
    username: user.username,
    token: rawToken
  });
}


router.get('/login', (req, res) => {
  res.sendFile('auth.html', { root: require('path').dirname(require.main.filename) });
});

router.get('/register', (req, res) => {
  res.sendFile('auth.html', { root: require('path').dirname(require.main.filename) });
});


function isMailDisabled() {
  return process.env.NODE_ENV === 'production'
    && !(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const user = await queries.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    if (!user.email_verified) {
      if (isMailDisabled()) {
        await queries.verifyUserEmail(user.id);
        user.email_verified = true;
      } else {
        return res.status(403).json({
          error: 'Подтвердите email перед входом',
          requiresVerification: true,
          email: user.email
        });
      }
    }
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, level: user.level, xp: user.xp } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const role = req.body.role === 'expert' ? 'expert' : 'user';
    const existing = await queries.getUserByEmail(normalizedEmail);
    if (existing) {
      if (existing.email_verified) {
        return res.status(409).json({ error: 'Пользователь уже существует' });
      }
      const mailResult = await issueVerificationEmail(req, existing);
      if (mailResult.mode === 'disabled') {
        const verifiedUser = await queries.verifyUserEmail(existing.id);
        const token = generateToken(verifiedUser);
        return res.status(200).json({
          success: true,
          token,
          user: { id: verifiedUser.id, username: verifiedUser.username, role: verifiedUser.role, level: verifiedUser.level, xp: verifiedUser.xp },
          message: 'Аккаунт активирован.'
        });
      }
      return res.status(200).json({
        success: true,
        verificationRequired: true,
        email: existing.email,
        message: 'Аккаунт уже создан, но почта ещё не подтверждена. Мы отправили новое письмо.',
        verificationPreviewUrl: process.env.NODE_ENV === 'production' ? null : mailResult.verificationUrl
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await queries.createUser(username.trim(), normalizedEmail, passwordHash, role, false);
    const mailResult = await issueVerificationEmail(req, newUser);
    if (mailResult.mode === 'disabled') {
      const verifiedUser = await queries.verifyUserEmail(newUser.id);
      const token = generateToken(verifiedUser);
      return res.status(201).json({
        success: true,
        token,
        user: { id: verifiedUser.id, username: verifiedUser.username, role: verifiedUser.role, level: verifiedUser.level, xp: verifiedUser.xp },
        message: 'Аккаунт создан и активирован.'
      });
    }
    res.status(201).json({
      success: true,
      verificationRequired: true,
      email: newUser.email,
      message: 'Аккаунт создан. Подтвердите почту по ссылке из письма.',
      verificationPreviewUrl: process.env.NODE_ENV === 'production' ? null : mailResult.verificationUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.redirect('/auth.html?verified=missing');
    }

    const user = await queries.getUserByVerificationTokenHash(hashVerificationToken(token));
    if (!user) {
      return res.redirect('/auth.html?verified=invalid');
    }
    if (user.email_verified) {
      return res.redirect('/auth.html?verified=already');
    }
    if (!user.email_verification_expires_at || new Date(user.email_verification_expires_at).getTime() < Date.now()) {
      await queries.clearEmailVerificationToken(user.id);
      return res.redirect(`/auth.html?verified=expired&email=${encodeURIComponent(user.email)}`);
    }

    await queries.verifyUserEmail(user.id);
    res.redirect('/auth.html?verified=success');
  } catch (err) {
    console.error(err);
    res.redirect('/auth.html?verified=error');
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Укажите корректный email' });
    }

    const user = await queries.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ success: true, message: 'Если такой email зарегистрирован, письмо будет отправлено повторно.' });
    }
    if (user.email_verified) {
      return res.status(400).json({ error: 'Эта почта уже подтверждена' });
    }

    const lastSentAt = user.verification_sent_at ? new Date(user.verification_sent_at).getTime() : 0;
    const retryInMs = RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);
    if (retryInMs > 0) {
      return res.status(429).json({
        error: `Повторная отправка будет доступна через ${Math.ceil(retryInMs / 1000)} сек.`,
        retryAfter: Math.ceil(retryInMs / 1000)
      });
    }

    const mailResult = await issueVerificationEmail(req, user);
    res.json({
      success: true,
      message: 'Письмо отправлено повторно.',
      verificationPreviewUrl: process.env.NODE_ENV === 'production' ? null : mailResult.verificationUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/logout', (req, res) => {
  res.json({ message: 'Выход выполнен' });
});

module.exports = router;
