const fs = require('fs');
const path = require('path');
const dir = path.join('/home/ubuntu/nazuna-bot/dados/database/grupos');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let scheduledGroups = [];
for (const file of files) {
  const filePath = path.join(dir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.schedule && (data.schedule.abrir || data.schedule.fechar)) {
      scheduledGroups.push({ group: file.replace('.json', ''), schedule: data.schedule });
      delete data.schedule;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {}
}
console.log(JSON.stringify(scheduledGroups, null, 2));
