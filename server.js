require('dotenv').config();



const hasDatabaseUrl = !!process.env.DATABASE_URL;
const REQUIRED_ENV = hasDatabaseUrl
  ? ['JWT_SECRET']
  : ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET === 'fallback_secret' || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be a secure random string of at least 32 characters.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const questRoutes = require('./routes/quests');
const userRoutes = require('./routes/users');
const expertRoutes = require('./routes/experts');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const supportRoutes = require('./routes/support');
const aiRoutes = require('./routes/ai');
const communityRoutes = require('./routes/community');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const IS_DEV = process.env.NODE_ENV !== 'production';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  /\.vercel\.app$/,
  /jasmin-ochre\.vercel\.app$/
];

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, 
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https://videos.pexels.com", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: false
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(morgan(IS_DEV ? 'dev' : 'combined'));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_DEV ? 200 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' }
});

app.use(globalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/user', userRoutes);
app.use('/api/experts', expertRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/community', communityRoutes);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  res.status(404).json({ error: 'Маршрут не найден' });
});


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: IS_DEV ? err.message : 'Внутренняя ошибка сервера'
  });
});

const pool = require('./db/pool');

(async function runMigrations() {
  try {
    await pool.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_text TEXT');
  } catch (err) {
    console.error('Migration reply_text failed:', err.message);
  }
  try {
    await pool.query("ALTER TABLE quests ADD COLUMN IF NOT EXISTS quest_type VARCHAR(20) DEFAULT 'expert'");
  } catch (err) {
    console.error('Migration quest_type failed:', err.message);
  }
  try {
    await pool.query("UPDATE quests SET quest_type = 'expert' WHERE quest_type IS NULL");
  } catch (err) {
    console.error('Migration quest_type backfill failed:', err.message);
  }
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE");
  } catch (err) {
    console.error('Migration email_verified failed:', err.message);
  }
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT');
  } catch (err) {
    console.error('Migration email_verification_token_hash failed:', err.message);
  }
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ');
  } catch (err) {
    console.error('Migration email_verification_expires_at failed:', err.message);
  }
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ');
  } catch (err) {
    console.error('Migration verification_sent_at failed:', err.message);
  }
  try {
    await pool.query('ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS reply_text TEXT');
  } catch (err) {
    console.error('Migration support reply_text failed:', err.message);
  }
  try {
    await pool.query('ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ');
  } catch (err) {
    console.error('Migration support replied_at failed:', err.message);
  }

  try {
    await pool.query(`
      INSERT INTO users (username, email, password_hash, role, level, xp, email_verified) VALUES
        ('Dmitry_Steel',    'dmitry@ludo.app', '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1,  0,    TRUE),
        ('Elena_Mind',      'elena@ludo.app',  '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1,  0,    TRUE),
        ('Viktor_Code',     'viktor@ludo.app', '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1,  0,    TRUE),
        ('Ivan_The_Great',  'ivan@test.com',   '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   15, 8500, TRUE),
        ('Masha_Beginner',  'masha@test.com',  '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   2,  450,  TRUE),
        ('Petr_Runner',     'petr@test.com',   '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   5,  1200, TRUE)
      ON CONFLICT (email) DO NOTHING
    `);
  } catch (err) {
    console.error('Seed users failed:', err.message);
  }

  try {
    await pool.query(`
      INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
      SELECT id, 'Фитнес и Бодибилдинг', 'Построил тело мечты сотням учеников. Мастер дисциплины.', 2500, 12, TRUE
      FROM users WHERE username = 'Dmitry_Steel'
      ON CONFLICT (user_id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
      SELECT id, 'Психология и Когнитивистика', 'Специалист по борьбе с выгоранием и поиску внутреннего ресурса.', 3000, 8, TRUE
      FROM users WHERE username = 'Elena_Mind'
      ON CONFLICT (user_id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
      SELECT id, 'Python Development', 'Senior Python Dev в BigTech. Обучаю кодить с нуля до первого оффера.', 1500, 6, TRUE
      FROM users WHERE username = 'Viktor_Code'
      ON CONFLICT (user_id) DO NOTHING
    `);
  } catch (err) {
    console.error('Seed expert_profiles failed:', err.message);
  }

  try {
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, 'Стальной Пресс: Интенсив', '7 дней жёстких тренировок на кор и правильного питания.', 'Sport', 'Hard', 7, 500, 990, 'expert'
      FROM users WHERE username = 'Dmitry_Steel'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = 'Стальной Пресс: Интенсив')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, 'Цифровой Детокс', 'Верните себе способность концентрироваться. Минимум соцсетей, максимум осознанности.', 'Mindset', 'Medium', 7, 300, 0, 'expert'
      FROM users WHERE username = 'Elena_Mind'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = 'Цифровой Детокс')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, 'Первый бот на Python', 'Напишите своего первого полезного Telegram-бота за неделю.', 'Coding', 'Medium', 7, 450, 490, 'expert'
      FROM users WHERE username = 'Viktor_Code'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = 'Первый бот на Python')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, 'Утренний фокус', '5 дней коротких утренних действий для спокойного старта и концентрации.', 'Mindset', 'Easy', 5, 220, 0, 'community'
      FROM users WHERE username = 'Admin_Ludo'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = 'Утренний фокус')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, '7 дней без сахара', 'Комьюнити-челлендж: убираем сладкие перекусы и отмечаем самочувствие каждый день.', 'Health', 'Medium', 7, 360, 0, 'community'
      FROM users WHERE username = 'Admin_Ludo'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = '7 дней без сахара')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, '30 минут движения', 'Небольшой ежедневный челлендж от сообщества: прогулка, растяжка или легкая тренировка.', 'Sport', 'Easy', 7, 320, 0, 'community'
      FROM users WHERE username = 'Admin_Ludo'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = '30 минут движения')
    `);
    await pool.query(`
      INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
      SELECT id, 'Чистый стол - чистая голова', '3 дня на быстрый порядок в рабочей зоне, чтобы легче начинать учебу и работу.', 'Productivity', 'Easy', 3, 180, 0, 'community'
      FROM users WHERE username = 'Admin_Ludo'
        AND NOT EXISTS (SELECT 1 FROM quests WHERE name = 'Чистый стол - чистая голова')
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT id, 1, 'Замер и Тест', 'Замерьте талию и сделайте максимальное количество скручиваний.', '<p>Запишите видео теста.</p>'
      FROM quests WHERE name = 'Стальной Пресс: Интенсив'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT id, 1, 'Тишина утром', 'Первый час после пробуждения без телефона.', '<p>Почитайте книгу или выйдите на прогулку.</p>'
      FROM quests WHERE name = 'Цифровой Детокс'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT id, 1, 'Установка Python', 'Установите Python и VS Code, запустите первый скрипт.', '<p>Выведите "Hello, World!" в консоль.</p>'
      FROM quests WHERE name = 'Первый бот на Python'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT q.id, t.day_number, t.title, t.description, t.instructions_html
      FROM quests q
      JOIN (VALUES
        (1, 'Старт без телефона', 'Проведите первые 20 минут утра без телефона.', '<p>После пробуждения выпейте воды, откройте окно и не заходите в соцсети первые 20 минут.</p>'),
        (2, 'План на 3 пункта', 'Запишите три главных дела дня.', '<p>Выберите максимум три задачи и отметьте одну самую важную.</p>'),
        (3, 'Фокус-таймер', 'Сделайте один 25-минутный блок без отвлечений.', '<p>Поставьте таймер, уберите уведомления и после блока напишите короткий итог.</p>'),
        (4, 'Пауза для энергии', 'Сделайте 5 минут движения в середине дня.', '<p>Подойдет прогулка, растяжка или легкая разминка.</p>'),
        (5, 'Итог недели', 'Запишите, что помогло держать фокус.', '<p>Опишите один прием, который хотите оставить на следующую неделю.</p>')
      ) AS t(day_number, title, description, instructions_html) ON TRUE
      WHERE q.name = 'Утренний фокус'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT q.id, t.day_number, t.title, t.description, t.instructions_html
      FROM quests q
      JOIN (VALUES
        (1, 'Уберите сладкий перекус', 'Замените один сладкий перекус фруктом или орехами.', '<p>Сфотографируйте замену или напишите, чем заменили сладкое.</p>'),
        (2, 'Напитки без сахара', 'День без сладких напитков.', '<p>Выберите воду, чай или кофе без сахара и отметьте самочувствие.</p>'),
        (3, 'Чтение состава', 'Проверьте сахар в одном привычном продукте.', '<p>Напишите, сколько сахара нашли на этикетке.</p>'),
        (4, 'Полезный десерт', 'Приготовьте простой десерт без добавленного сахара.', '<p>Подойдет йогурт, ягоды, творог или фруктовая тарелка.</p>'),
        (5, 'Вечер без сладкого', 'Проведите вечер без конфет и выпечки.', '<p>Замените привычку чаем, прогулкой или короткой растяжкой.</p>'),
        (6, 'Поддержка сообщества', 'Поделитесь маленьким лайфхаком против тяги к сладкому.', '<p>Напишите один прием, который сработал именно у вас.</p>'),
        (7, 'Финальный отчет', 'Опишите изменения в энергии и настроении.', '<p>Подведите итог недели и решите, что оставите дальше.</p>')
      ) AS t(day_number, title, description, instructions_html) ON TRUE
      WHERE q.name = '7 дней без сахара'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT q.id, t.day_number, t.title, t.description, t.instructions_html
      FROM quests q
      JOIN (VALUES
        (1, 'Прогулка 30 минут', 'Выйдите на спокойную прогулку.', '<p>Загрузите фото маршрута или короткий комментарий о прогулке.</p>'),
        (2, 'Растяжка', 'Сделайте 30 минут мягкой растяжки.', '<p>Выберите шею, спину, ноги и двигайтесь без боли.</p>'),
        (3, 'Лестница или шаги', 'Добавьте активность в обычный день.', '<p>Пройдитесь пешком, выберите лестницу или сделайте круг вокруг дома.</p>'),
        (4, 'Домашняя тренировка', 'Сделайте легкую тренировку без оборудования.', '<p>Например: приседания, планка, отжимания от стены, разминка.</p>'),
        (5, 'Активный перерыв', 'Разбейте 30 минут на три блока по 10 минут.', '<p>Сделайте небольшие движения утром, днем и вечером.</p>'),
        (6, 'Любимое движение', 'Выберите активность, которая вам нравится.', '<p>Танцы, велосипед, прогулка, йога или любая безопасная нагрузка.</p>'),
        (7, 'Итог движения', 'Опишите, как изменилась энергия за неделю.', '<p>Отметьте лучший формат движения, который хотите повторять.</p>')
      ) AS t(day_number, title, description, instructions_html) ON TRUE
      WHERE q.name = '30 минут движения'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
      SELECT q.id, t.day_number, t.title, t.description, t.instructions_html
      FROM quests q
      JOIN (VALUES
        (1, 'Уберите лишнее', 'Освободите рабочую поверхность от всего, что не нужно сегодня.', '<p>Оставьте только ноутбук, блокнот, воду и один нужный инструмент.</p>'),
        (2, 'Разберите цифровой стол', 'Очистите рабочий стол компьютера или папку загрузок.', '<p>Удалите лишнее, разложите важные файлы по папкам.</p>'),
        (3, 'Система на завтра', 'Подготовьте рабочее место к следующему дню.', '<p>Запишите три задачи и оставьте стол в состоянии, с которого приятно начать.</p>')
      ) AS t(day_number, title, description, instructions_html) ON TRUE
      WHERE q.name = 'Чистый стол - чистая голова'
      ON CONFLICT (quest_id, day_number) DO NOTHING
    `);
  } catch (err) {
    console.error('Seed quests failed:', err.message);
  }

  try {
    await pool.query(`
      DELETE FROM users
      WHERE role = 'user'
        AND email NOT IN ('alex@ludo.com','ivan@test.com','masha@test.com','petr@test.com')
        AND (
          username ~* '^(QuestExpertFinal|QuestFinal|QuestDebug|QuestVerify|AuditTest|TestUser|DemoUser)'
          OR email ~* '@(example\\.com|aktiv\\.local|manual\\.activ|ludo\\.local)$'
        )
    `);
  } catch (err) {
    console.error('Cleanup test users failed:', err.message);
  }

  try {
    await pool.query(`
      DELETE FROM support_tickets
      WHERE email LIKE '%@aktiv.local'
         OR email LIKE '%@manual.activ'
         OR LOWER(subject) LIKE '%тест%'
         OR LOWER(message) LIKE '%тестов%'
    `);
  } catch (err) {
    console.error('Cleanup test support tickets failed:', err.message);
  }

  try {
    await pool.query(`
      DELETE FROM quest_submissions
      WHERE LOWER(comment) LIKE '%тестов%' OR LOWER(comment) LIKE '%фикс%'
    `);
  } catch (err) {
    console.error('Cleanup test submissions failed:', err.message);
  }
})();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 AKTIV API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
