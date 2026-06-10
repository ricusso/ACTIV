const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Имя обязательно' });
    if (!email || !EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Некорректный email' });
    if (!message || message.trim().length < 10) {
      return res.status(400).json({ error: 'Сообщение должно содержать минимум 10 символов' });
    }

    const ticket = await queries.createSupportTicket(
      name.trim(),
      email.trim().toLowerCase(),
      (subject || '').trim(),
      message.trim()
    );

    res.status(201).json({
      success: true,
      message: 'Ваше обращение принято. Мы ответим в течение 24 часов.',
      ticketId: ticket.id
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const user = await queries.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const tickets = await queries.getSupportTicketsByEmail(user.email);
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const tickets = await queries.getSupportTicketsForAdmin();
    res.json(tickets);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
