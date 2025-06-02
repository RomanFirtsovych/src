// src/helpers.js
const fs = require('fs');

function log(level, message, ...args) {
  const timestamp = new Date().toLocaleString('uk-UA', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}

function loadJSON(file, defaultValue) {
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf-8');
      if (data) {
        log('info', `Завантажено ${file}`);
        return JSON.parse(data);
      }
    } catch (error) {
      log('error', `Помилка читання ${file}:`, error.message);
    }
  }
  log('warn', `Файл ${file} не знайдено або порожній. Використано значення за замовчуванням.`);
  return defaultValue;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    log('info', `Збережено ${file}`);
  } catch (error) {
    log('error', `Помилка запису ${file}:`, error.message);
  }
}

module.exports = {
  log,
  loadJSON,
  saveJSON,
};