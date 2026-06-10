const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const queries = require('../db/queries');

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat:free';
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;

function cleanEnvValue(value) {
  return String(value || '')
    .replace(/\\r|\\n/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function getOpenRouterConfig() {
  return {
    apiKey: cleanEnvValue(process.env.OPENROUTER_API_KEY),
    model: cleanEnvValue(process.env.OPENROUTER_MODEL) || DEFAULT_MODEL
  };
}

const initialConfig = getOpenRouterConfig();
const API_KEY = initialConfig.apiKey;

if (!API_KEY) {
  console.warn('WARN: OPENROUTER_API_KEY is not set. AI chat will use local fallback answers.');
}

router.get('/config', (req, res) => {
  const config = getOpenRouterConfig();
  res.json({
    aiEnabled: true,
    providerConfigured: !!config.apiKey,
    mode: config.apiKey ? 'openrouter' : 'fallback'
  });
});

function buildSystemPrompt(user, quests, streak) {
  const questContext = quests && quests.length > 0
    ? quests.map(q => `- "${q.name}" (день ${q.current_day || 0} из ${q.duration_days || '?'})`).join('\n')
    : 'нет активных квестов';

  return `Ты — AI-помощник платформы AKTIV (Ludo). Это геймифицированная платформа для саморазвития, где пользователи проходят квесты от экспертов, выполняют ежедневные задания, зарабатывают XP, повышают уровень и поддерживают streak (серию дней).

Твоя роль:
- Отвечай на вопросы о платформе AKTIV (квесты, XP, уровни, энергия, streak, достижения, эксперты).
- Мотивируй пользователя, помогай ему не сорваться с квеста, давай практические советы по продуктивности, здоровью, фитнесу, обучению.
- Если пользователь просит сгенерировать план, идею для квеста или задание — помогай креативно, но не выдумывай функционал, которого нет на платформе.
- Если вопрос совсем не по теме (политика, вредные инструкции, нелегальные действия), вежливо откажи и переведи разговор обратно к саморазвитию.
- Будь дружелюбным, энергичным, поддерживающим. Обращайся на "ты". Используй эмодзи умеренно.

Текущий пользователь:
- Имя: ${user?.username || 'игрок'}
- Уровень: ${user?.level || 1}
- XP: ${user?.xp || 0}
- Энергия: ${user?.energy || 100}/100
- Streak: ${streak || 0} дней
- Активные квесты:\n${questContext}`;
}

function getLastUserMessage(messages) {
  const last = [...messages].reverse().find(m => m.role === 'user');
  return String(last?.content || '').trim();
}

function buildFallbackReply(user, quests, streak, messages) {
  const text = getLastUserMessage(messages).toLowerCase();
  const name = user?.username || 'игрок';
  const level = user?.level || 1;
  const xp = user?.xp || 0;
  const energy = user?.energy ?? 100;
  const activeQuest = Array.isArray(quests) && quests.length ? quests[0] : null;
  const questLine = activeQuest
    ? `Сейчас у тебя активен квест "${activeQuest.name}", день ${activeQuest.current_day || 1} из ${activeQuest.duration_days || '?'}.`
    : 'Сейчас активных квестов нет, поэтому лучше начать с каталога и выбрать короткий бесплатный квест.';

  if (text.includes('xp') || text.includes('опыт') || text.includes('уров')) {
    return `${name}, XP начисляется за вступление в квесты, отчеты по дням, одобренные задания и достижения. Сейчас у тебя ${xp} XP и уровень ${level}. Самый быстрый путь: выбери один активный квест, отправь отчет за текущий день и дождись проверки эксперта.`;
  }

  if (text.includes('streak') || text.includes('стрик') || text.includes('сер')) {
    return `${name}, streak держится на регулярности: каждый день делай маленькое действие по квесту и отправляй отчет. Сейчас streak: ${streak || 0}. Чтобы не сорваться, поставь цель "минимум 10 минут" и делай отчет сразу после выполнения.`;
  }

  if (text.includes('квест') || text.includes('задан') || text.includes('помоги')) {
    return `${name}, давай быстро разложим квест на понятные шаги. ${questLine}\n\n1. Открой текущий день квеста и прочитай условие.\n2. Выполни минимальную версию задания, даже если не идеально.\n3. Загрузи фото или видеоотчет.\n4. Добавь короткий комментарий: что сделал, что было сложно, какой следующий шаг.\n\nЭнергия сейчас: ${energy}/100. Если сил мало, сделай облегченную версию задания, но не пропускай день.`;
  }

  if (text.includes('достижен') || text.includes('ачив')) {
    return `Достижения открываются за полезные действия: вступление в квесты, выполнение заданий, streak и покупки. Твоя задача сейчас простая: держать регулярность и закрывать дни квеста. Платформа сама начислит достижение, когда условие выполнено.`;
  }

  return `${name}, я рядом как помощник AKTIV. Могу помочь с квестом, XP, streak, достижениями или планом на день. ${questLine} Напиши, что именно хочешь сделать сейчас, и я разложу это на 3-4 простых шага.`;
}

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Передайте массив messages' });
    }

    
    const trimmedMessages = messages.slice(-MAX_HISTORY).map(m => ({
      role: m.role === 'assistant' || m.role === 'user' ? m.role : 'user',
      content: String(m.content || '').slice(0, MAX_MESSAGE_LENGTH)
    }));

    
    const userId = req.user.id;
    let userContext = null;
    let userQuests = [];
    let streak = 0;
    try {
      userContext = await queries.getUserById(userId);
      userQuests = await queries.getUserActiveQuests(userId);
      streak = await queries.getUserStreak(userId);
    } catch (dbErr) {
      console.error('AI context DB error:', dbErr.message);
      
    }

    const systemPrompt = buildSystemPrompt(userContext, userQuests, streak);
    const config = getOpenRouterConfig();

    if (!config.apiKey) {
      return res.json({
        reply: buildFallbackReply(userContext, userQuests, streak, trimmedMessages),
        mode: 'fallback'
      });
    }

    const payload = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedMessages
      ],
      temperature: 0.8,
      max_tokens: 1024
    };

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
        'X-Title': 'AKTIV AI Assistant'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', response.status, errorText);
      return res.json({
        reply: buildFallbackReply(userContext, userQuests, streak, trimmedMessages),
        mode: 'fallback'
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.json({
        reply: buildFallbackReply(userContext, userQuests, streak, trimmedMessages),
        mode: 'fallback'
      });
    }

    res.json({ reply, mode: 'openrouter' });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'Ошибка сервера при обработке запроса к AI' });
  }
});

module.exports = router;
