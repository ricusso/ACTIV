const fs = require('fs');
let c = fs.readFileSync('expert-finances.html', 'utf-8');


c = c.replace(/(\d)\s*\?/g, '$1 ₽');


c = c.replace(/<span class="w-currency">\?<\/span>/g, '<span class="w-currency">₽</span>');


c = c.replace(/<button class="w-close" onclick="closeWithdraw\(\)">\?<\/button>/g, '<button class="w-close" onclick="closeWithdraw()">✕</button>');


c = c.replace(/\? Ожидаемое зачисление/g, '⏱ Ожидаемое зачисление');


c = c.replace(/Биохакинг сна \? 3/g, 'Биохакинг сна · 3');

fs.writeFileSync('expert-finances.html', c, 'utf-8');
console.log('Done');
