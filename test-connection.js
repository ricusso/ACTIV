require('dotenv').config();
const queries = require('./db/queries');

async function testConnection() {
  console.log('🚀 Проверка подключения к базе данных Ludo...');
  
  try {
    
    const quests = await queries.getAllQuests();
    
    if (quests.length > 0) {
      console.log('✅ Подключение успешно! Список квестов:');
      quests.forEach(q => {
        console.log(` - [${q.difficulty}] ${q.name} (Эксперт: ${q.expert_name || 'Система'})`);
      });
    } else {
      console.log('⚠️ Подключено, но квесты не найдены. Проверьте выполнение Seed Data.');
    }

    
    const user = await queries.getUserById(1);
    if (user) {
      console.log(`✅ Данные игрока загружены: ${user.username}, Уровень: ${user.level}, XP: ${user.xp}`);
    }

  } catch (err) {
    console.error('❌ Ошибка подключения или запроса:');
    if (err.code === '28P01') {
      console.error('   Неверный пароль в файле .env!');
    } else if (err.code === '3D000') {
      console.error('   База данных ludo_db не найдена!');
    } else {
      console.error('  ', err.message);
    }
  } finally {
    
    require('./db/pool').end();
  }
}

testConnection();
