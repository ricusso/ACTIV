const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = http.request(opts, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(out) }); }
        catch (e) { resolve({ s: res.statusCode, b: out }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function test() {
  let pass = 0, fail = 0;
  const check = (label, ok, info = '') => {
    const icon = ok ? '✓' : '✗';
    console.log(icon + ' ' + label + (info ? ' | ' + info : ''));
    ok ? pass++ : fail++;
  };

  
  let r = await req('POST', '/api/auth/login', { email: 'admin@ludo.com', password: '123456' });
  check('Admin login', r.s === 200 && r.b.user && r.b.user.role === 'admin');
  const adminTok = r.b.token;

  r = await req('POST', '/api/auth/login', { email: 'artem@ludo.com', password: '123456' });
  check('Expert login', r.s === 200 && r.b.user && r.b.user.role === 'expert', r.b.user && r.b.user.username);
  const expTok = r.b.token;
  const expId = r.b.user && r.b.user.id;

  r = await req('POST', '/api/auth/login', { email: 'ivan@test.com', password: '123456' });
  check('User login', r.s === 200, 'xp=' + (r.b.user && r.b.user.xp));
  const usrTok = r.b.token;
  const usrId = r.b.user && r.b.user.id;

  r = await req('POST', '/api/auth/login', { email: 'admin@ludo.com', password: 'wrongpassword' });
  check('Wrong password blocked (401)', r.s === 401);

  
  r = await req('GET', '/api/quests');
  check('List quests (public)', r.s === 200 && Array.isArray(r.b), r.b.length + ' quests');

  r = await req('GET', '/api/quests?type=community');
  check('List community quests', r.s === 200 && Array.isArray(r.b) && r.b.length >= 4, (Array.isArray(r.b) ? r.b.length : 0) + ' community quests');

  const questPayload = {
    questData: { name: 'Final E2E Quest', description: 'automated test quest', category: 'Спорт', difficulty: 'Easy', duration: 3, rewardXp: 45, price: 0 },
    tasks: [
      { day: 1, title: 'Day 1', description: 'First task', instructions: '<p>Do it</p>' },
      { day: 2, title: 'Day 2', description: 'Second task', instructions: '<p>Do it</p>' },
      { day: 3, title: 'Day 3', description: 'Third task', instructions: '<p>Do it</p>' }
    ]
  };

  r = await req('POST', '/api/quests', questPayload, expTok);
  check('Create quest (expert)', r.s === 201 && r.b.questId, 'id=' + r.b.questId);
  const qId = r.b.questId;

  r = await req('POST', '/api/quests', questPayload, usrTok);
  check('Create quest (user) → 403 blocked', r.s === 403);

  const personalQuestPayload = {
    questData: { name: 'Personal E2E Quest ' + Date.now(), description: 'personal test quest', category: 'Фокус', difficulty: 'Easy', duration: 2, rewardXp: 30, price: 0 },
    tasks: [
      { day: 1, title: 'Personal Day 1', description: 'First personal task', instructions: '<p>Do it</p>' },
      { day: 2, title: 'Personal Day 2', description: 'Second personal task', instructions: '<p>Do it</p>' }
    ],
    questType: 'personal'
  };

  r = await req('POST', '/api/quests', personalQuestPayload, usrTok);
  check('Create personal quest auto-joins', r.s === 201 && r.b.questId && r.b.enrollment && r.b.enrollment.quest_id === r.b.questId);
  const personalQuestId = r.b.questId;

  r = await req('GET', '/api/user/' + usrId + '/quests', null, usrTok);
  check('Personal quest appears in my quests', r.s === 200 && Array.isArray(r.b) && r.b.some(q => q.quest_id === personalQuestId && q.quest_type === 'personal'));

  const generatedPersonalPayload = {
    questData: { name: 'Generated Tasks E2E Quest ' + Date.now(), description: 'generated daily task', category: 'Фокус', difficulty: 'Easy', duration: 3, rewardXp: 45, price: 0 },
    tasks: [],
    questType: 'personal'
  };

  r = await req('POST', '/api/quests', generatedPersonalPayload, usrTok);
  check('Create personal quest generates tasks', r.s === 201 && r.b.questId && r.b.enrollment);
  const generatedPersonalQuestId = r.b.questId;

  r = await req('GET', '/api/quests/' + generatedPersonalQuestId + '/task/2', null, usrTok);
  check('Generated personal day task exists', r.s === 200 && r.b.day_number === 2 && r.b.title);

  r = await req('POST', '/api/quests/join', { questId: qId }, usrTok);
  check('Join quest', r.s === 200 && r.b.success);

  r = await req('POST', '/api/quests/complete-day', {
    questId: qId,
    dayNumber: 1,
    fileUrl: '/uploads/e2e-report.mp4',
    comment: 'Первый день выполнен'
  }, usrTok);
  check('Submit day 1 report', r.s === 201 && r.b.success && r.b.status === 'pending');
  const submissionId = r.b.submission && r.b.submission.id;

  
  r = await req('GET', '/api/admin/stats', null, adminTok);
  check('Admin stats', r.s === 200 && r.b.totalUsers, 'users=' + r.b.totalUsers);

  r = await req('GET', '/api/admin/leaderboard', null, adminTok);
  check('Admin leaderboard', r.s === 200 && Array.isArray(r.b), r.b.length + ' players');

  r = await req('GET', '/api/admin/submissions', null, adminTok);
  check('Admin submissions', r.s === 200 && Array.isArray(r.b));

  r = await req('POST', '/api/admin/submissions/' + submissionId + '/status', { status: 'approved', comment: 'ok' }, adminTok);
  check('Approve submission', r.s === 200 && r.b.status === 'approved');

  
  r = await req('GET', '/api/experts');
  check('List experts (public)', r.s === 200 && Array.isArray(r.b), r.b.length + ' experts');

  r = await req('GET', '/api/experts/' + expId + '/quests', null, expTok);
  check('Expert quest list', r.s === 200, (Array.isArray(r.b) ? r.b.length : 0) + ' quests');

  
  r = await req('GET', '/api/user/' + usrId + '/notifications', null, usrTok);
  check('User notifications', r.s === 200, 'unread=' + r.b.unreadCount);

  r = await req('GET', '/api/user/me/profile', null, usrTok);
  check('Own profile (/me)', r.s === 200 && r.b.username);

  r = await req('GET', '/api/ai/config', null, usrTok);
  check('AI config', r.s === 200 && r.b.aiEnabled === true);

  r = await req('POST', '/api/ai/chat', {
    messages: [{ role: 'user', content: 'Помоги с квестом' }]
  }, usrTok);
  check('AI assistant reply', r.s === 200 && r.b.reply && r.b.reply.length > 20, r.b.mode || 'openrouter');

  
  r = await req('POST', '/api/support/contact', {
    name: 'Ivan',
    email: 'ivan@test.com',
    subject: 'Технический баг',
    message: 'E2E test support message for user flow'
  });
  check('Support ticket', r.s === 201 && r.b.success, 'id=' + r.b.ticketId);
  const supportTicketId = r.b.ticketId;

  r = await req('GET', '/api/support/mine', null, usrTok);
  check('User support list', r.s === 200 && Array.isArray(r.b) && r.b.some(t => t.id === supportTicketId));

  r = await req('POST', '/api/admin/support/' + supportTicketId + '/reply', { message: 'Ответ службы поддержки' }, adminTok);
  check('Admin support reply', r.s === 200 && r.b.success && r.b.ticket && r.b.ticket.reply_text === 'Ответ службы поддержки');

  r = await req('GET', '/api/support/mine', null, usrTok);
  const repliedTicket = Array.isArray(r.b) ? r.b.find(t => t.id === supportTicketId) : null;
  check('User sees support reply', r.s === 200 && repliedTicket && repliedTicket.reply_text === 'Ответ службы поддержки');

  
  const total = pass + fail;
  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + ' | ' + pass + '/' + total + ' tests');
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('E2E crash:', e.message); process.exit(1); });
