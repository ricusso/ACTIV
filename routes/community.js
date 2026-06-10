const express = require('express');
const router = express.Router();
const queries = require('../db/queries');

router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const players = await queries.getTopPlayers(limit);
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
