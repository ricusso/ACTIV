const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken } = require('../middleware/auth');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function prepareQuestTasks(questData, tasks) {
  const duration = Number.parseInt(questData.duration, 10);
  if (!Number.isInteger(duration) || duration < 1) return tasks;

  const taskMap = new Map();
  (Array.isArray(tasks) ? tasks : []).forEach((task, index) => {
    const day = Number.parseInt(task.day, 10) || index + 1;
    if (day >= 1 && day <= duration && !taskMap.has(day)) {
      taskMap.set(day, task);
    }
  });

  const prepared = [];
  for (let day = 1; day <= duration; day += 1) {
    const source = taskMap.get(day) || {};
    const fallbackTitle = `День ${day}: ${String(questData.name || 'шаг квеста').trim() || 'шаг квеста'}`;
    const fallbackDescription = String(questData.description || `Выполните шаг ${day} и зафиксируйте результат.`).trim();
    const title = String(source.title || fallbackTitle).trim();
    const description = String(source.description || fallbackDescription).trim();
    prepared.push({
      day,
      title,
      description,
      instructions: String(source.instructions || `<p>${escapeHtml(description || title)}</p>`).trim()
    });
  }
  return prepared;
}

function normalizeQuestPayload(questData, tasks, questType) {
  const normalizedType = questType === 'personal' || questType === 'community' ? questType : 'expert';
  const duration = Number.parseInt(questData.duration, 10);
  const rewardXp = Number.parseInt(questData.rewardXp, 10);
  const price = normalizedType === 'expert' ? (Number.parseInt(questData.price, 10) || 0) : 0;

  if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
    throw new Error('Длительность квеста должна быть от 1 до 365 дней');
  }
  if (!Number.isInteger(rewardXp) || rewardXp < 0 || rewardXp > 100000) {
    throw new Error('Некорректное количество XP');
  }
  if (price < 0 || price > 1000000) {
    throw new Error('Некорректная стоимость квеста');
  }
  if (tasks.length !== duration) {
    throw new Error('Количество заданий должно совпадать с длительностью квеста');
  }

  const normalizedTasks = tasks
    .map((task, index) => ({
      day: Number.parseInt(task.day, 10) || index + 1,
      title: String(task.title || '').trim(),
      description: String(task.description || '').trim(),
      instructions: String(task.instructions || '').trim()
    }))
    .sort((a, b) => a.day - b.day);

  normalizedTasks.forEach((task, index) => {
    if (task.day !== index + 1) {
      throw new Error('Дни заданий должны идти подряд без пропусков');
    }
    if (!task.title) {
      throw new Error(`Заполните название задания для дня ${task.day}`);
    }
    if (!task.instructions) {
      task.instructions = `<p>${task.description || task.title}</p>`;
    }
  });

  return {
    questData: {
      ...questData,
      duration,
      rewardXp,
      price,
      questType: normalizedType
    },
    tasks: normalizedTasks
  };
}


router.get('/', async (req, res) => {
  try {
    const type = req.query.type; 
    if (!type || type === 'community') {
      await queries.ensureCommunityQuests();
    }
    const quests = await queries.getAllQuests({ type });
    res.json(quests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/task/:dayNumber', authenticateToken, async (req, res) => {
  try {
    const quest = await queries.getQuestById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Квест не найден' });

    const progress = await queries.getUserQuestProgress(req.user.id, req.params.id);
    if (!progress) {
      return res.status(403).json({ error: 'Сначала вступите в квест' });
    }

    const task = await queries.getTaskByDay(req.params.id, req.params.dayNumber);
    if (!task) return res.status(404).json({ error: 'Задание не найдено' });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.get('/:id', async (req, res) => {
  try {
    const quest = await queries.getQuestById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Квест не найден' });
    res.json(quest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.post('/', authenticateToken, async (req, res) => {
  try {
    const { questData, tasks, questType } = req.body;
    if (!questData || !questData.name || !questData.description) {
      return res.status(400).json({ error: 'Название и описание обязательны' });
    }
    const preparedTasks = prepareQuestTasks(questData, tasks);
    if (!Array.isArray(preparedTasks) || preparedTasks.length === 0) {
      return res.status(400).json({ error: 'Добавьте хотя бы одно задание' });
    }

    const normalized = normalizeQuestPayload(questData, preparedTasks, questType || questData.questType);
    if (normalized.questData.questType === 'expert' && req.user.role !== 'expert' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только эксперты могут создавать эксперт-квесты' });
    }
    const questId = await queries.createFullQuest(req.user.id, normalized.questData, normalized.tasks);
    let enrollment = null;
    if (normalized.questData.questType === 'personal' || normalized.questData.questType === 'community') {
      enrollment = await queries.joinQuest(req.user.id, questId, { pricePaid: 0 });
    }
    res.status(201).json({ success: true, questId, enrollment });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Ошибка создания квеста' });
  }
});


router.post('/join', authenticateToken, async (req, res) => {
  try {
    const { questId, price } = req.body;
    if (!questId) {
      return res.status(400).json({ error: 'questId обязателен' });
    }
    const userId = req.user.id;
    const enrollment = await queries.joinQuest(userId, questId, { pricePaid: price });
    res.json({ success: true, message: 'Вы записались на квест', enrollment });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Ошибка записи на квест' });
  }
});

router.post('/complete-day', authenticateToken, async (req, res) => {
  try {
    const { questId, dayNumber, fileUrl, comment } = req.body;
    if (!questId || !dayNumber) {
      return res.status(400).json({ error: 'questId и dayNumber обязательны' });
    }

    const result = await queries.submitQuestDayReport(
      req.user.id,
      questId,
      dayNumber,
      fileUrl,
      comment
    );

    res.status(201).json({
      success: true,
      status: result.submission.status,
      message: 'Отчёт отправлен на проверку',
      submission: result.submission,
      dayXp: result.dayXp
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Ошибка отправки отчёта' });
  }
});

module.exports = router;
