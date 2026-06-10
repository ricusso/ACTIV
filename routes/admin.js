const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken, authorizeRole } = require('../middleware/auth');


router.get('/stats', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const stats = await queries.getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/leaderboard', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const leaderboard = await queries.getTopPlayers();
    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.get('/submissions', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const submissions = await queries.getAllSubmissions();
    res.json(submissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/submissions/:id/status', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { status, comment } = req.body;
    const submission = await queries.updateSubmissionStatus(req.params.id, status, comment);
    res.json(submission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

router.get('/partner-requests', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const rows = await queries.getSupportTicketsForAdmin({ includePartnerRequests: true });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/partner-requests/:id/status', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const status = req.body.status === 'approved' ? 'approved' : 'rejected';
    const row = await queries.updatePartnerRequestStatus(req.params.id, status);
    if (!row) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/support/:id/reply', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim().length < 5) {
      return res.status(400).json({ error: 'Ответ должен содержать минимум 5 символов' });
    }
    const ticket = await queries.getSupportTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Обращение не найдено' });

    const updatedTicket = await queries.replyToSupportTicket(req.params.id, message.trim());
    const userRes = await queries.getUserByEmail(ticket.email.toLowerCase());
    if (userRes) {
      await queries.createNotification(
        userRes.id,
        'support_reply',
        'Ответ от поддержки',
        message.trim()
      );
    }
    res.json({ success: true, notified: !!userRes, ticket: updatedTicket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/support', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const rows = await queries.getSupportTicketsForAdmin();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
