const pool = require('./pool');

function calculateQuestDayXp(rewardXp, durationDays) {
  const safeReward = Number.isFinite(Number(rewardXp)) ? Number(rewardXp) : 0;
  const safeDuration = Math.max(1, Number.parseInt(durationDays, 10) || 1);
  return Math.max(10, Math.round(safeReward / safeDuration));
}

function normalizeCompletedDays(completedDays) {
  return Array.isArray(completedDays) ? completedDays.map(String) : [];
}

const queries = {
  
  
  async getUserById(id) {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, xp, level, avatar_url, energy,
              last_energy_update, created_at, email_verified
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  
  async getUserPublicProfile(id) {
    const { rows } = await pool.query(
      `SELECT id, username, role, xp, level, avatar_url, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  async syncUserEnergy(userId) {
    const text = `
      UPDATE users 
      SET 
        energy = LEAST(100, energy + FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_energy_update)) / 3600) * 10),
        last_energy_update = last_energy_update + (FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_energy_update)) / 3600) * INTERVAL '1 hour')
      WHERE id = $1 AND last_energy_update < CURRENT_TIMESTAMP - INTERVAL '1 hour'
      RETURNING energy`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0] ? rows[0].energy : null;
  },

  async getUserByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
  },

  async getUserByUsername(username) {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return rows[0];
  },

  async getUserActiveQuests(userId) {
    const text = `
      SELECT q.name, q.duration_days, uq.current_day, uq.status
      FROM user_quests uq
      JOIN quests q ON uq.quest_id = q.id
      WHERE uq.user_id = $1 AND uq.status = 'active'
      ORDER BY uq.joined_at DESC
      LIMIT 5`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async createUser(username, email, passwordHash, role = 'user', emailVerified = true) {
    const text = `
      INSERT INTO users (username, email, password_hash, role, email_verified)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, role, email_verified`;
    const { rows } = await pool.query(text, [username, email, passwordHash, role, emailVerified]);
    return rows[0];
  },

  async saveEmailVerificationToken(userId, tokenHash, expiresAt) {
    const text = `
      UPDATE users
      SET email_verification_token_hash = $2,
          email_verification_expires_at = $3,
          verification_sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, username, email_verified, verification_sent_at`;
    const { rows } = await pool.query(text, [userId, tokenHash, expiresAt]);
    return rows[0];
  },

  async getUserByVerificationTokenHash(tokenHash) {
    const text = `
      SELECT id, username, email, role, email_verified, email_verification_expires_at
      FROM users
      WHERE email_verification_token_hash = $1`;
    const { rows } = await pool.query(text, [tokenHash]);
    return rows[0];
  },

  async verifyUserEmail(userId) {
    const text = `
      UPDATE users
      SET email_verified = TRUE,
          email_verification_token_hash = NULL,
          email_verification_expires_at = NULL,
          verification_sent_at = NULL
      WHERE id = $1
      RETURNING id, username, email, role, email_verified, level, xp`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0];
  },

  async clearEmailVerificationToken(userId) {
    const text = `
      UPDATE users
      SET email_verification_token_hash = NULL,
          email_verification_expires_at = NULL,
          verification_sent_at = NULL
      WHERE id = $1
      RETURNING id, email`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0];
  },

  async updateUserProfile(id, username, email) {
    const text = `
      UPDATE users 
      SET username = $2, email = $3
      WHERE id = $1 
      RETURNING id, username, email, role, xp, level, avatar_url`;
    const { rows } = await pool.query(text, [id, username, email]);
    return rows[0];
  },

  async updateUserAvatar(id, avatarUrl) {
    const text = `
      UPDATE users SET avatar_url = $2 WHERE id = $1 
      RETURNING id, username, email, role, xp, level, avatar_url`;
    const { rows } = await pool.query(text, [id, avatarUrl]);
    return rows[0];
  },

  async updateUserXP(userId, xpToAdd) {
    const text = `
      UPDATE users 
      SET xp = xp + $2, 
          level = floor((xp + $2) / 1000) + 1 
      WHERE id = $1 
      RETURNING xp, level`;
    const { rows } = await pool.query(text, [userId, xpToAdd]);
    return rows[0];
  },

  
  async getQuestById(id) {
    const { rows } = await pool.query(
      `SELECT q.*, u.username as expert_name, u.role as creator_role
       FROM quests q
       LEFT JOIN users u ON q.expert_id = u.id
       WHERE q.id = $1`,
      [id]
    );
    return rows[0];
  },

  async getAllQuests({ limit = 50, offset = 0, type = null } = {}) {
    let text = `
      SELECT q.*, u.username as expert_name, u.role as creator_role
      FROM quests q
      LEFT JOIN users u ON q.expert_id = u.id`;
    const params = [Math.min(limit, 200), offset];
    if (type === 'expert' || type === 'community') {
      text += ' WHERE q.quest_type = $3';
      params.push(type);
    }
    text += ' ORDER BY q.created_at DESC LIMIT $1 OFFSET $2';
    const { rows } = await pool.query(text, params);
    return rows;
  },

  async ensureCommunityQuests() {
    const client = await pool.connect();
    const quests = [
      {
        name: 'Утренний фокус',
        description: '5 дней коротких утренних действий для спокойного старта и концентрации.',
        category: 'Mindset',
        difficulty: 'Easy',
        duration: 5,
        rewardXp: 220,
        tasks: [
          ['Старт без телефона', 'Проведите первые 20 минут утра без телефона.', '<p>После пробуждения выпейте воды, откройте окно и не заходите в соцсети первые 20 минут.</p>'],
          ['План на 3 пункта', 'Запишите три главных дела дня.', '<p>Выберите максимум три задачи и отметьте одну самую важную.</p>'],
          ['Фокус-таймер', 'Сделайте один 25-минутный блок без отвлечений.', '<p>Поставьте таймер, уберите уведомления и после блока напишите короткий итог.</p>'],
          ['Пауза для энергии', 'Сделайте 5 минут движения в середине дня.', '<p>Подойдет прогулка, растяжка или легкая разминка.</p>'],
          ['Итог недели', 'Запишите, что помогло держать фокус.', '<p>Опишите один прием, который хотите оставить на следующую неделю.</p>']
        ]
      },
      {
        name: '7 дней без сахара',
        description: 'Комьюнити-челлендж: убираем сладкие перекусы и отмечаем самочувствие каждый день.',
        category: 'Health',
        difficulty: 'Medium',
        duration: 7,
        rewardXp: 360,
        tasks: [
          ['Уберите сладкий перекус', 'Замените один сладкий перекус фруктом или орехами.', '<p>Сфотографируйте замену или напишите, чем заменили сладкое.</p>'],
          ['Напитки без сахара', 'День без сладких напитков.', '<p>Выберите воду, чай или кофе без сахара и отметьте самочувствие.</p>'],
          ['Чтение состава', 'Проверьте сахар в одном привычном продукте.', '<p>Напишите, сколько сахара нашли на этикетке.</p>'],
          ['Полезный десерт', 'Приготовьте простой десерт без добавленного сахара.', '<p>Подойдет йогурт, ягоды, творог или фруктовая тарелка.</p>'],
          ['Вечер без сладкого', 'Проведите вечер без конфет и выпечки.', '<p>Замените привычку чаем, прогулкой или короткой растяжкой.</p>'],
          ['Поддержка сообщества', 'Поделитесь маленьким лайфхаком против тяги к сладкому.', '<p>Напишите один прием, который сработал именно у вас.</p>'],
          ['Финальный отчет', 'Опишите изменения в энергии и настроении.', '<p>Подведите итог недели и решите, что оставите дальше.</p>']
        ]
      },
      {
        name: '30 минут движения',
        description: 'Небольшой ежедневный челлендж от сообщества: прогулка, растяжка или легкая тренировка.',
        category: 'Sport',
        difficulty: 'Easy',
        duration: 7,
        rewardXp: 320,
        tasks: [
          ['Прогулка 30 минут', 'Выйдите на спокойную прогулку.', '<p>Загрузите фото маршрута или короткий комментарий о прогулке.</p>'],
          ['Растяжка', 'Сделайте 30 минут мягкой растяжки.', '<p>Выберите шею, спину, ноги и двигайтесь без боли.</p>'],
          ['Лестница или шаги', 'Добавьте активность в обычный день.', '<p>Пройдитесь пешком, выберите лестницу или сделайте круг вокруг дома.</p>'],
          ['Домашняя тренировка', 'Сделайте легкую тренировку без оборудования.', '<p>Например: приседания, планка, отжимания от стены, разминка.</p>'],
          ['Активный перерыв', 'Разбейте 30 минут на три блока по 10 минут.', '<p>Сделайте небольшие движения утром, днем и вечером.</p>'],
          ['Любимое движение', 'Выберите активность, которая вам нравится.', '<p>Танцы, велосипед, прогулка, йога или любая безопасная нагрузка.</p>'],
          ['Итог движения', 'Опишите, как изменилась энергия за неделю.', '<p>Отметьте лучший формат движения, который хотите повторять.</p>']
        ]
      },
      {
        name: 'Чистый стол - чистая голова',
        description: '3 дня на быстрый порядок в рабочей зоне, чтобы легче начинать учебу и работу.',
        category: 'Productivity',
        difficulty: 'Easy',
        duration: 3,
        rewardXp: 180,
        tasks: [
          ['Уберите лишнее', 'Освободите рабочую поверхность от всего, что не нужно сегодня.', '<p>Оставьте только ноутбук, блокнот, воду и один нужный инструмент.</p>'],
          ['Разберите цифровой стол', 'Очистите рабочий стол компьютера или папку загрузок.', '<p>Удалите лишнее, разложите важные файлы по папкам.</p>'],
          ['Система на завтра', 'Подготовьте рабочее место к следующему дню.', '<p>Запишите три задачи и оставьте стол в состоянии, с которого приятно начать.</p>']
        ]
      }
    ];

    try {
      await client.query('BEGIN');
      const { rows: authorRows } = await client.query(
        `SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`
      );
      const authorId = authorRows[0]?.id;
      if (!authorId) {
        await client.query('COMMIT');
        return 0;
      }

      for (const quest of quests) {
        await client.query(
          `INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
           SELECT $1::integer, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::integer, $7::integer, 0, 'community'::varchar
           WHERE NOT EXISTS (SELECT 1 FROM quests WHERE name = $2::varchar)`,
          [authorId, quest.name, quest.description, quest.category, quest.difficulty, quest.duration, quest.rewardXp]
        );
        const { rows } = await client.query(
          'SELECT id FROM quests WHERE name = $1 LIMIT 1',
          [quest.name]
        );
        const questId = rows[0]?.id;
        if (!questId) continue;

        for (let index = 0; index < quest.tasks.length; index += 1) {
          const [title, description, instructions] = quest.tasks[index];
          await client.query(
            `INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (quest_id, day_number) DO NOTHING`,
            [questId, index + 1, title, description, instructions]
          );
        }
      }

      await client.query('COMMIT');
      return quests.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async checkAndAwardAchievements(userId, type) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      
      const text = `
        SELECT * FROM achievements 
        WHERE requirement_type = $1 
        AND id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = $2)`;
      const { rows: potentialAchievs } = await client.query(text, [type, userId]);

      const awarded = [];

      for (const ach of potentialAchievs) {
        let isEligible = false;
        
        
        if (type === 'quest_join') {
          const { rows } = await client.query('SELECT COUNT(*) FROM user_quests WHERE user_id = $1', [userId]);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        } else if (type === 'task_complete') {
          const { rows } = await client.query('SELECT COUNT(*) FROM quest_submissions WHERE status = $1 AND user_quest_id IN (SELECT id FROM user_quests WHERE user_id = $2)', ['approved', userId]);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        } else if (type === 'streak') {
          
          const streak = await this.getUserStreak(userId);
          if (streak >= ach.requirement_value) isEligible = true;
        } else if (type === 'purchase') {
          const { rows } = await client.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND purpose = $2 AND status = $3', [userId, 'quest_purchase', 'completed']);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        }

        
        if (isEligible) {
          await client.query('INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)', [userId, ach.id]);
          await client.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [ach.reward_xp, userId]);
          
          
          await client.query(
            'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
            [userId, 'achievement', 'Новое достижение!', `Вы получили ачивку «${ach.name}» и +${ach.reward_xp} XP!`]
          );
          
          awarded.push(ach);
        }
      }

      await client.query('COMMIT');
      return awarded;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async joinQuest(userId, questId, { pricePaid = 0 } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const questRes = await client.query(
        'SELECT id, expert_id, name, price, quest_type FROM quests WHERE id = $1',
        [questId]
      );
      const quest = questRes.rows[0];
      if (!quest) {
        throw new Error('Квест не найден');
      }

      const existing = await client.query(
        'SELECT * FROM user_quests WHERE user_id = $1 AND quest_id = $2',
        [userId, questId]
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return existing.rows[0];
      }

      const requiredPrice = Number(quest.price) || 0;
      const actualPaid = Number(pricePaid) || 0;
      if (requiredPrice > 0) {
        if (actualPaid !== requiredPrice) {
          throw new Error('Сумма оплаты не совпадает со стоимостью квеста');
        }

        await client.query(
          `INSERT INTO transactions (user_id, expert_id, amount, purpose, status)
           VALUES ($1, $2, $3, $4, 'completed')`,
          [userId, quest.expert_id, requiredPrice, 'quest_purchase']
        );
      }

      const { rows } = await client.query(
        'INSERT INTO user_quests (user_id, quest_id) VALUES ($1, $2) RETURNING *',
        [userId, questId]
      );

      await client.query('COMMIT');
      await this.checkAndAwardAchievements(userId, 'quest_join');
      return rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async completeQuestDay(userId, questId, date) {
    const text = `
      UPDATE user_quests 
      SET completed_days = completed_days || jsonb_build_array($3::text)
      WHERE user_id = $1 AND quest_id = $2
      AND NOT (completed_days @> jsonb_build_array($3::text))
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, questId, date]);
    return rows[0];
  },

  
  async getTaskByDay(questId, dayNumber) {
    const text = `
      SELECT qt.*, q.name as quest_name, q.duration_days, q.quest_type
      FROM quest_tasks qt
      JOIN quests q ON q.id = qt.quest_id
      WHERE qt.quest_id = $1 AND qt.day_number = $2`;
    const { rows } = await pool.query(text, [questId, dayNumber]);
    return rows[0];
  },

  async submitReport(userQuestId, dayNumber, fileUrl, comment) {
    const text = `
      INSERT INTO quest_submissions (user_quest_id, day_number, file_url, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userQuestId, dayNumber, fileUrl, comment]);
    return rows[0];
  },

  async getUserQuestProgress(userId, questId) {
    const text = `
      SELECT uq.*, q.name as quest_name, q.duration_days
      FROM user_quests uq
      JOIN quests q ON uq.quest_id = q.id
      WHERE uq.user_id = $1 AND uq.quest_id = $2`;
    const { rows } = await pool.query(text, [userId, questId]);
    return rows[0];
  },

  async submitQuestDayReport(userId, questId, dayNumber, fileUrl, comment = '') {
    const normalizedDay = Number.parseInt(dayNumber, 10);
    if (!Number.isInteger(normalizedDay) || normalizedDay < 1) {
      throw new Error('Некорректный номер дня');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const progressRes = await client.query(
        `SELECT uq.*, q.name as quest_name, q.duration_days, q.reward_xp, q.quest_type
         FROM user_quests uq
         JOIN quests q ON q.id = uq.quest_id
         WHERE uq.user_id = $1 AND uq.quest_id = $2
         FOR UPDATE`,
        [userId, questId]
      );
      const progress = progressRes.rows[0];
      if (!progress) {
        throw new Error('Сначала вступите в квест');
      }
      if (progress.status !== 'active') {
        throw new Error('Этот квест уже не активен');
      }
      if (normalizedDay > Number(progress.duration_days)) {
        throw new Error('Указан день вне диапазона квеста');
      }

      const taskRes = await client.query(
        'SELECT * FROM quest_tasks WHERE quest_id = $1 AND day_number = $2',
        [questId, normalizedDay]
      );
      if (!taskRes.rows[0]) {
        throw new Error('Задание для этого дня не найдено');
      }

      const currentDay = Number(progress.current_day) || 1;
      if (normalizedDay > currentDay) {
        throw new Error('Сначала завершите предыдущий день квеста');
      }

      const latestSubmissionRes = await client.query(
        `SELECT *
         FROM quest_submissions
         WHERE user_quest_id = $1 AND day_number = $2
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [progress.id, normalizedDay]
      );
      const latestSubmission = latestSubmissionRes.rows[0];
      if (latestSubmission && latestSubmission.status === 'pending') {
        throw new Error('Отчёт за этот день уже отправлен и ожидает проверки');
      }
      if (latestSubmission && latestSubmission.status === 'approved') {
        throw new Error('Этот день уже подтверждён');
      }

      const dayXp = calculateQuestDayXp(progress.reward_xp, progress.duration_days);
      const submissionRes = await client.query(
        `INSERT INTO quest_submissions (user_quest_id, day_number, file_url, comment, xp_awarded)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [progress.id, normalizedDay, fileUrl || null, comment || '', dayXp]
      );

      await client.query(
        `INSERT INTO notifications (user_id, type, title, content)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          'quest_update',
          'Отчёт отправлен',
          `Ваш отчёт за день ${normalizedDay} по квесту «${progress.quest_name}» отправлен на проверку.`
        ]
      );

      const questOwnerRes = await client.query(
        `SELECT q.expert_id, u.username AS player_name
           FROM quests q, users u
          WHERE q.id = $1 AND u.id = $2`,
        [questId, userId]
      );
      const ownerRow = questOwnerRes.rows[0];
      if (ownerRow && ownerRow.expert_id && ownerRow.expert_id !== userId) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, content)
           VALUES ($1, $2, $3, $4)`,
          [
            ownerRow.expert_id,
            'quest_update',
            'Новый отчёт на проверку',
            `${ownerRow.player_name} сдал день ${normalizedDay} квеста «${progress.quest_name}».`
          ]
        );
      }

      await client.query('COMMIT');
      return {
        submission: submissionRes.rows[0],
        progress,
        dayXp
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  
  async getAllSubmissions({ limit = 100, offset = 0 } = {}) {
    const text = `
      SELECT qs.*, u.username, q.name as quest_name, q.reward_xp
      FROM quest_submissions qs
      JOIN user_quests uq ON qs.user_quest_id = uq.id
      JOIN users u ON uq.user_id = u.id
      JOIN quests q ON uq.quest_id = q.id
      ORDER BY qs.created_at DESC
      LIMIT $1 OFFSET $2`;
    const { rows } = await pool.query(text, [Math.min(limit, 200), offset]);
    return rows;
  },

  async updateSubmissionStatus(submissionId, status, adminComment) {
    const VALID_STATUSES = ['approved', 'rejected', 'pending'];
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Недопустимый статус: ${status}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currentRes = await client.query(
        `SELECT qs.*, uq.id as user_quest_id, uq.user_id, uq.quest_id, uq.completed_days, uq.current_day,
                q.reward_xp, q.duration_days, q.name as quest_name
         FROM quest_submissions qs
         JOIN user_quests uq ON qs.user_quest_id = uq.id
         JOIN quests q ON uq.quest_id = q.id
         WHERE qs.id = $1
         FOR UPDATE`,
        [submissionId]
      );
      const current = currentRes.rows[0];
      if (!current) throw new Error('Отчёт не найден');
      if (current.status === 'approved' && status !== 'approved') {
        throw new Error('Нельзя изменять уже одобренный отчёт');
      }

      const res = await client.query(
        'UPDATE quest_submissions SET status = $2, comment = $3 WHERE id = $1 RETURNING *',
        [submissionId, status, adminComment || current.comment]
      );
      const sub = res.rows[0];

      let approvedUserId = null;

      if (status === 'approved' && current.status !== 'approved') {
        approvedUserId = current.user_id;
        const dayXp = current.xp_awarded || calculateQuestDayXp(current.reward_xp, current.duration_days);
        const completedDays = normalizeCompletedDays(current.completed_days);
        const dayKey = String(sub.day_number);
        if (!completedDays.includes(dayKey)) {
          completedDays.push(dayKey);
        }

        const completedCount = completedDays.length;
        const totalDays = Number(current.duration_days) || 1;
        const nextDay = Math.min(totalDays, completedCount + 1);
        const nextStatus = completedCount >= totalDays ? 'completed' : 'active';

        await client.query(
          `UPDATE user_quests
           SET completed_days = $2::jsonb,
               current_day = $3,
               status = $4
           WHERE id = $1`,
          [current.user_quest_id, JSON.stringify(completedDays), nextDay, nextStatus]
        );

        await client.query(
          'UPDATE users SET xp = xp + $2, level = floor((xp + $2) / 1000) + 1 WHERE id = $1',
          [current.user_id, dayXp]
        );
        await client.query(
          `INSERT INTO user_xp_history (user_id, amount, reason)
           VALUES ($1, $2, $3)`,
          [current.user_id, dayXp, `Квест «${current.quest_name}», день ${sub.day_number}`]
        );
        const approveText = adminComment && adminComment.trim()
          ? `Ваш отчёт за день ${sub.day_number} одобрен. Начислено ${dayXp} XP. Комментарий проверяющего: ${adminComment.trim()}`
          : `Ваш отчёт за день ${sub.day_number} одобрен. Начислено ${dayXp} XP.`;
        await client.query(
          'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
          [current.user_id, 'quest_update', 'Отчёт принят!', approveText]
        );
      } else if (status === 'rejected') {
        await client.query(
          'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
          [current.user_id, 'system', 'Отчёт отклонён', `Ваш отчёт за день ${sub.day_number} не прошёл модерацию: ${adminComment || 'без комментария'}`]
        );
      }

      await client.query('COMMIT');
      if (approvedUserId) {
        await this.checkAndAwardAchievements(approvedUserId, 'task_complete');
      }
      return sub;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  
  async getExpertAvailability(expertId) {
    const text = 'SELECT * FROM expert_availability WHERE expert_id = $1 ORDER BY day_of_week, start_time';
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async bookSession(expertId, userId, scheduledAt, duration, price, link) {
    const text = `
      INSERT INTO expert_sessions (expert_id, user_id, scheduled_at, duration_minutes, price_paid, meeting_link)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`;
    const { rows } = await pool.query(text, [expertId, userId, scheduledAt, duration, price, link]);
    return rows[0];
  },

  async getUserSessions(userId) {
    const text = `
      SELECT s.*, u.username as expert_name, ep.specialization
      FROM expert_sessions s
      JOIN users u ON s.expert_id = u.id
      JOIN expert_profiles ep ON u.id = ep.user_id
      WHERE s.user_id = $1
      ORDER BY s.scheduled_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async updateSessionStatus(sessionId, status) {
    const text = 'UPDATE expert_sessions SET status = $2 WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(text, [sessionId, status]);
    return rows[0];
  },

  
  async getUserSubscription(userId) {
    const text = 'SELECT * FROM user_subscriptions WHERE user_id = $1';
    const { rows } = await pool.query(text, [userId]);
    return rows[0];
  },

  async createTransaction(userId, amount, purpose, expertId = null) {
    const text = `
      INSERT INTO transactions (user_id, amount, purpose, expert_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, amount, purpose, expertId]);
    return rows[0];
  },

  async getExpertSubmissions(expertId) {
    const text = `
      SELECT qs.*, q.name as quest_title, u.username as user_username, u.avatar_url as user_avatar
      FROM quest_submissions qs
      JOIN user_quests uq ON qs.user_quest_id = uq.id
      JOIN quests q ON uq.quest_id = q.id
      JOIN users u ON uq.user_id = u.id
      WHERE q.expert_id = $1
      ORDER BY qs.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertTransactions(expertId) {
    const text = `
      SELECT t.*, u.username as buyer_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.expert_id = $1
      ORDER BY t.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getUserStreak(userId) {
    const text = `
      WITH date_series AS (
        SELECT DISTINCT created_at::date as active_date
        FROM user_xp_history
        WHERE user_id = $1
      ),
      streak_groups AS (
        SELECT active_date,
               active_date - (row_number() OVER (ORDER BY active_date) * INTERVAL '1 day') as grp
        FROM date_series
      )
      SELECT COUNT(*) as streak
      FROM streak_groups
      WHERE grp = (
        SELECT grp FROM streak_groups 
        WHERE active_date >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY active_date DESC LIMIT 1
      )`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0] ? parseInt(rows[0].streak) : 0;
  },

  
  async getAdminStats() {
    const stats = {};
    
    
    const revenueRes = await pool.query("SELECT SUM(amount) as total FROM transactions WHERE status = 'completed'");
    stats.totalRevenue = revenueRes.rows[0].total || 0;

    
    const questsRes = await pool.query('SELECT quest_type, COUNT(*) as count FROM quests GROUP BY quest_type');
    stats.questTypes = questsRes.rows;

    
    const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
    stats.totalUsers = usersCount.rows[0].count;

    return stats;
  },

  
  async getExpertQuests(expertId) {
    const text = `
      SELECT q.*, (SELECT COUNT(*) FROM user_quests uq WHERE uq.quest_id = q.id) as participants_count
      FROM quests q
      WHERE q.expert_id = $1
      ORDER BY q.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertClients(expertId) {
    const text = `
      SELECT DISTINCT u.id, u.username, u.email, u.avatar_url, u.level, uq.joined_at, q.name as quest_name
      FROM user_quests uq
      JOIN users u ON uq.user_id = u.id
      JOIN quests q ON uq.quest_id = q.id
      WHERE q.expert_id = $1
      ORDER BY uq.joined_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertFinances(expertId) {
    const text = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_gross,
        COALESCE(SUM(amount) * 0.7, 0) as total_net
      FROM transactions
      WHERE expert_id = $1 AND status = 'completed'`;
    const { rows } = await pool.query(text, [expertId]);
    return { 
      revenue: parseFloat(rows[0].total_net),
      gross: parseFloat(rows[0].total_gross)
    };
  },

  async getTopPlayers(limit = 10) {
    const text = `
      SELECT username, level, xp, avatar_url, role
      FROM users
      WHERE role = 'user'
      ORDER BY xp DESC
      LIMIT $1`;
    const { rows } = await pool.query(text, [limit]);
    return rows;
  },

  async createFullQuest(expertId, questData, tasks) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const questRes = await client.query(
        `INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [expertId, questData.name, questData.description, questData.category, questData.difficulty, questData.duration, questData.rewardXp, questData.price, questData.questType || 'expert']
      );
      const questId = questRes.rows[0].id;

      for (const task of tasks) {
        await client.query(
          `INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
           VALUES ($1, $2, $3, $4, $5)`,
          [questId, task.day, task.title, task.description, task.instructions]
        );
      }

      await client.query('COMMIT');
      return questId;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  
  async awardAchievement(userId, achievementId) {
    const text = `
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, achievementId]);
    return rows[0];
  },

  async getUserAchievements(userId) {
    const text = `
      SELECT a.*, ua.earned_at
      FROM achievements a
      JOIN user_achievements ua ON a.id = ua.achievement_id
      WHERE ua.user_id = $1
      ORDER BY ua.earned_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async updateUserSkill(userId, skillName, xpToAdd) {
    const text = `
      INSERT INTO user_skills (user_id, skill_name, current_xp)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, skill_name) DO UPDATE
      SET current_xp = user_skills.current_xp + $3,
          level = floor((user_skills.current_xp + $3) / 500) + 1
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, skillName, xpToAdd]);
    return rows[0];
  },

  async getUserSkills(userId) {
    const text = 'SELECT * FROM user_skills WHERE user_id = $1';
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  
  async createNotification(userId, type, title, content) {
    const text = `
      INSERT INTO notifications (user_id, type, title, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, type, title, content]);
    return rows[0];
  },

  async getUserNotifications(userId) {
    const text = `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async markNotificationAsRead(notificationId) {
    const text = 'UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(text, [notificationId]);
    return rows[0];
  },

  async getUnreadCount(userId) {
    const text = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE';
    const { rows } = await pool.query(text, [userId]);
    return rows[0].count;
  },

  async getExpertFullProfile(expertId) {
    const expertRes = await pool.query(`
      SELECT u.id, u.username as name, u.avatar_url, ep.specialization, ep.bio, ep.rating, 
             ep.experience_years, ep.consultation_price as price
      FROM users u
      JOIN expert_profiles ep ON u.id = ep.user_id
      WHERE u.id = $1`, [expertId]);
      
    if (expertRes.rows.length === 0) return null;
    
    
    const statsRes = await pool.query(`
      SELECT COUNT(DISTINCT uq.user_id) as students_count,
             (SELECT COUNT(*) FROM reviews WHERE expert_id = $1) as reviews_count
      FROM quests q
      LEFT JOIN user_quests uq ON q.id = uq.quest_id
      WHERE q.expert_id = $1`, [expertId]);
    
    const questsRes = await pool.query(`
      SELECT id, name, description, duration_days, reward_xp, price, difficulty 
      FROM quests WHERE expert_id = $1`, [expertId]);
    
    return {
      ...expertRes.rows[0],
      ...statsRes.rows[0],
      quests: questsRes.rows
    };
  },

  
  async getVerifiedExperts() {
    const text = `
      SELECT u.username, ep.* 
      FROM expert_profiles ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.is_verified = TRUE
      ORDER BY ep.rating DESC`;
    const { rows } = await pool.query(text);
    return rows;
  },

  async updateExpertProfile(userId, data) {
    const text = `
      INSERT INTO expert_profiles (user_id, specialization, bio, experience_years, consultation_price)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET specialization = EXCLUDED.specialization,
          bio = EXCLUDED.bio,
          experience_years = EXCLUDED.experience_years,
          consultation_price = EXCLUDED.consultation_price
      RETURNING *`;
    const { rows } = await pool.query(text, [
      userId, 
      data.specialization || 'Специалист', 
      data.bio || '', 
      data.experience_years ?? data.experience ?? 0, 
      data.price ?? data.consultation_price ?? 0
    ]);
    return rows[0];
  },
  async getExpertReviews(expertId) {
    const text = `
      SELECT r.*, u.username, u.avatar_url
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.expert_id = $1
      ORDER BY r.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async replyToReview(reviewId, expertId, replyText) {
    const text = `
      UPDATE reviews SET reply_text = $1
      WHERE id = $2 AND expert_id = $3
      RETURNING *`;
    const { rows } = await pool.query(text, [replyText, reviewId, expertId]);
    return rows[0];
  },

  async createSupportTicket(name, email, subject, message) {
    const text = `
      INSERT INTO support_tickets (name, email, subject, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, subject, message, status, created_at, reply_text, replied_at`;
    const { rows } = await pool.query(text, [name, email, subject, message]);
    return rows[0];
  },

  async getSupportTicketsForAdmin({ includePartnerRequests = false } = {}) {
    const text = includePartnerRequests
      ? `
          SELECT id, name, email, subject, message, status, created_at, reply_text, replied_at
          FROM support_tickets
          WHERE subject LIKE '[PARTNER_REQUEST]%'
          ORDER BY created_at DESC
          LIMIT 200`
      : `
          SELECT id, name, email, subject, message, status, created_at, reply_text, replied_at
          FROM support_tickets
          WHERE subject NOT LIKE '[PARTNER_REQUEST]%' OR subject IS NULL
          ORDER BY created_at DESC
          LIMIT 200`;
    const { rows } = await pool.query(text);
    return rows;
  },

  async updatePartnerRequestStatus(ticketId, status) {
    const text = `
      UPDATE support_tickets
      SET status = $2
      WHERE id = $1 AND subject LIKE '[PARTNER_REQUEST]%'
      RETURNING id, status`;
    const { rows } = await pool.query(text, [ticketId, status]);
    return rows[0];
  },

  async getSupportTicketById(ticketId) {
    const text = `
      SELECT id, name, email, subject, message, status, created_at, reply_text, replied_at
      FROM support_tickets
      WHERE id = $1`;
    const { rows } = await pool.query(text, [ticketId]);
    return rows[0];
  },

  async replyToSupportTicket(ticketId, replyText) {
    const text = `
      UPDATE support_tickets
      SET status = 'closed',
          reply_text = $2,
          replied_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, email, subject, message, status, created_at, reply_text, replied_at`;
    const { rows } = await pool.query(text, [ticketId, replyText]);
    return rows[0];
  },

  async getSupportTicketsByEmail(email) {
    const text = `
      SELECT id, name, email, subject, message, status, created_at, reply_text, replied_at
      FROM support_tickets
      WHERE LOWER(email) = LOWER($1)
      ORDER BY created_at DESC
      LIMIT 100`;
    const { rows } = await pool.query(text, [email]);
    return rows;
  },

  
  async getChatHistory(user1, user2) {
    const text = `
      SELECT * FROM messages 
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC`;
    const { rows } = await pool.query(text, [user1, user2]);
    return rows;
  },

  async sendMessage(senderId, receiverId, content) {
    const text = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *';
    const { rows } = await pool.query(text, [senderId, receiverId, content]);
    return rows[0];
  },

  async getUserChats(userId) {
    const text = `
      WITH last_msgs AS (
        SELECT DISTINCT ON (
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
        )
        id, sender_id, receiver_id, content, created_at
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
        ORDER BY CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END, created_at DESC
      )
      SELECT lm.*, u.username as contact_name, u.avatar_url as contact_avatar, u.role as contact_role
      FROM last_msgs lm
      JOIN users u ON u.id = (CASE WHEN lm.sender_id = $1 THEN lm.receiver_id ELSE lm.sender_id END)
      ORDER BY lm.created_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  }
};

module.exports = queries;
