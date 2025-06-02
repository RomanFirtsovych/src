// src/bot.js
require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const LocalSession = require('telegraf-session-local'); // Для збереження сесій Wizard
const { log, loadJSON, saveJSON } = require('./helpers');
const { getAllOlxListings } = require('./olxParser'); // Змінено на getAllOlxListings
const { SUBSCRIBERS_FILE, PROCESSED_ADS_FILE, USER_SETTINGS_FILE, SESSION_FILE, DEFAULT_USER_SETTINGS } = require('./config');
const { filterWizard, formatSettings } = require('./scenes'); // Імпортуємо сцену та форматтер

log('info', 'Запуск бота...');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Налаштування для збереження сесій Telegraf (потрібно для Wizard Scenes)
// Правильне використання LocalSession для Telegraf v4+
bot.use(new LocalSession({ database: SESSION_FILE }).middleware());

const stage = new Scenes.Stage([filterWizard]);
bot.use(stage.middleware());


let subscribers = loadJSON(SUBSCRIBERS_FILE, []);
let processedAds = new Set(loadJSON(PROCESSED_ADS_FILE, []));
let userSettings = loadJSON(USER_SETTINGS_FILE, {});

// --- Допоміжна функція для збереження налаштувань користувача ---
function saveUserSettings() {
  saveJSON(USER_SETTINGS_FILE, userSettings);
}

// --- Відправка оголошень ---
async function sendListings() {
  log('info', 'Запуск періодичної перевірки нових оголошень...');

  if (subscribers.length === 0) {
    log('warn', 'Немає підписників. Пропускаємо перевірку.');
    return;
  }

  const currentProcessedAdsSize = processedAds.size;
  const subscribersToRemove = [];

  for (const userId of subscribers) {
    const settings = userSettings[userId] || DEFAULT_USER_SETTINGS;

    log('debug', `Перевірка оголошень для користувача ${userId} з фільтрами:`, settings);
    // Використовуємо getAllOlxListings для парсингу з пагінацією
    const newAdsForUser = await getAllOlxListings(settings, processedAds);

    if (newAdsForUser.length === 0) {
      log('debug', `Немає нових оголошень для користувача ${userId} за його фільтрами.`);
      continue;
    }

    log('info', `Знайдено ${newAdsForUser.length} нових оголошень для користувача ${userId}`);

    for (const ad of newAdsForUser) {
      if (processedAds.has(ad.id)) { // Подвійна перевірка на випадок, якщо було додано паралельно
          continue;
      }
      try {
        await bot.telegram.sendMessage(
          userId,
          `🏡 *${ad.title}*\n📍 *${ad.city}, ${ad.district}*\n💰 ${ad.price}\n🔗 [Детальніше](${ad.link})`,
          { parse_mode: 'Markdown' }
        );
        log('info', `Надіслано оголошення "${ad.title.substring(0, 30)}..." користувачу ${userId}`);
        processedAds.add(ad.id); // Додаємо до списку оброблених після успішної відправки
      } catch (error) {
        log('error', `Помилка надсилання повідомлення "${ad.title.substring(0, 30)}..." користувачу ${userId}: ${error.message}`);
        // Обробка блокування бота користувачем (HTTP 403 Forbidden)
        if (error.response && error.response.error_code === 403) {
          log('warn', `Користувач ${userId} заблокував бота. Додаємо до списку на видалення.`);
          subscribersToRemove.push(userId);
        }
      }
    }
  }

  // Видаляємо заблокованих користувачів після завершення циклу
  if (subscribersToRemove.length > 0) {
    subscribers = subscribers.filter(id => !subscribersToRemove.includes(id));
    subscribersToRemove.forEach(userId => delete userSettings[userId]);
    saveJSON(SUBSCRIBERS_FILE, subscribers);
    saveUserSettings();
    log('info', `Видалено ${subscribersToRemove.length} неактивних підписників.`);
  }

  if (processedAds.size > currentProcessedAdsSize) {
      saveJSON(PROCESSED_ADS_FILE, [...processedAds]); // Зберігаємо нові оброблені ID
      log('info', `Збережено нові оголошення. Загальна кількість оброблених: ${processedAds.size}`);
  } else {
      log('info', 'Нових оголошень не виявлено під час цієї перевірки.');
  }

  log('info', 'Перевірку оголошень завершено.');
}


// --- Команди ---

bot.telegram.setMyCommands([
  { command: 'start', description: 'Запустити бота та підписатися' },
  { command: 'filter', description: 'Налаштувати фільтри пошуку (інтерактивно)' },
  { command: 'settings', description: 'Показати поточні налаштування' },
  { command: 'check', description: 'Перевірити оголошення зараз' }, // Нова команда
  { command: 'stop', description: 'Відписатися від оновлень' },
  { command: 'help', description: 'Отримати довідку' },
]);

bot.start((ctx) => {
  const userId = ctx.message.chat.id;
  const username = ctx.message.chat.username || 'невідомо';
  log('info', `/start від ${userId} (@${username})`);

  if (!subscribers.includes(userId)) {
    subscribers.push(userId);
    saveJSON(SUBSCRIBERS_FILE, subscribers);

    userSettings[userId] = { ...DEFAULT_USER_SETTINGS };
    saveUserSettings();

    ctx.reply(
      '🎉 Вітаємо! Ви успішно підписалися на оновлення квартир 🏠. ' +
      'За замовчуванням шукаємо: Київ, будь-який район.\n\n' +
      `⚙️ Ваші поточні налаштування:\n${formatSettings(userSettings[userId])}\n\n` +
      'Ви можете змінити їх за допомогою команди /filter.'
    );
  } else {
    log('debug', `Користувач ${userId} вже підписаний`);
    ctx.reply(
      'ℹ️ Ви вже підписані на оновлення 📨.\n\n' +
      '⚙️ Тепер ви можете використовувати команди з меню бота (натисніть "/" або кнопку меню).'
    );
  }
});

bot.command('stop', (ctx) => {
  const userId = ctx.message.chat.id;
  log('info', `/stop від ${userId}`);

  if (subscribers.includes(userId)) {
    subscribers = subscribers.filter(id => id !== userId);
    saveJSON(SUBSCRIBERS_FILE, subscribers);

    delete userSettings[userId];
    saveUserSettings();

    ctx.reply('❌ Ви відписалися від оновлень. Якщо передумаєте — просто надішліть /start 📩');
    log('info', `Користувач ${userId} відписався`);
  } else {
    ctx.reply('ℹ️ Ви не були підписані на оновлення.');
  }
});

bot.command('settings', (ctx) => {
  const userId = ctx.message.chat.id;
  log('info', `/settings від ${userId}`);
  const settings = userSettings[userId];

  if (settings) {
    ctx.reply(`📊 *Ваші поточні налаштування пошуку:*\n${formatSettings(settings)}`, { parse_mode: 'Markdown' });
  } else {
    ctx.reply('⚠️ У вас немає збережених налаштувань. Будь ласка, почніть з /start.');
  }
});

// Нова команда для негайної перевірки
bot.command('check', async (ctx) => {
  const userId = ctx.message.chat.id;
  log('info', `/check від ${userId}`);
  await ctx.reply('🕵️‍♀️ Запускаю перевірку нових оголошень за вашими фільтрами. Зачекайте...');
  const settings = userSettings[userId] || DEFAULT_USER_SETTINGS;

  const newAdsForUser = await getAllOlxListings(settings, processedAds);

  if (newAdsForUser.length === 0) {
    await ctx.reply('🤷‍♀️ За вашими фільтрами нових оголошень не знайдено.');
  } else {
    log('info', `Знайдено ${newAdsForUser.length} нових оголошень для негайної відправки користувачу ${userId}`);
    let sentCount = 0;
    for (const ad of newAdsForUser) {
        if (processedAds.has(ad.id)) continue; // Перевірка, чи вже не надіслано

        try {
            await bot.telegram.sendMessage(
                userId,
                `🏡 *${ad.title}*\n📍 *${ad.city}, ${ad.district}*\n💰 ${ad.price}\n🔗 [Детальніше](${ad.link})`,
                { parse_mode: 'Markdown' }
            );
            processedAds.add(ad.id);
            sentCount++;
        } catch (error) {
            log('error', `Помилка надсилання оголошення під час /check "${ad.title.substring(0, 30)}..." користувачу ${userId}: ${error.message}`);
            // Не видаляємо з підписників тут, це обробляється у sendListings
        }
    }
    saveJSON(PROCESSED_ADS_FILE, [...processedAds]);
    await ctx.reply(`✅ Знайдено та надіслано ${sentCount} нових оголошень.`);
  }
});


// Змінено команду /filter для запуску Wizard Scene
bot.command('filter', async (ctx) => {
  const userId = ctx.message.chat.id;
  log('info', `/filter від ${userId} - Запуск Wizard Scene.`);
  // Передаємо функцію збереження в сцену
  ctx.scene.enter('filter-wizard', {
    userSettings: userSettings[userId] || DEFAULT_USER_SETTINGS,
    saveSettings: (updatedSettings) => {
      userSettings[userId] = updatedSettings;
      saveUserSettings();
      log('info', `Налаштування користувача ${userId} оновлено через Wizard.`);
    },
  });
});

bot.command('help', (ctx) => {
  log('info', `/help від ${ctx.message.chat.id}`);
  ctx.reply(`Доступні команди:
  /start - Запустити бота та підписатися на оновлення.
  /filter - Налаштувати критерії пошуку оголошень (інтерактивно за допомогою кнопок).
  /settings - Показати ваші поточні налаштування пошуку.
  /check - Перевірити нові оголошення за вашими фільтрами прямо зараз.
  /stop - Відписатися від отримання оновлень.
  /help - Показати це повідомлення.`);
});

// Логування всіх повідомлень (крім тих, що обробляються як фільтри)
bot.on('message', (ctx) => {
  const userId = ctx.message.chat.id;
  const username = ctx.message.chat.username || 'невідомо';
  const text = ctx.message.text || '';
  // Перевіряємо, чи це не колбек-запит (який обробляється сценою) і не частина Wizard
  if (!ctx.callbackQuery && (!ctx.scene.current || ctx.scene.current.id !== 'filter-wizard')) {
      log('debug', `Від ${userId} (@${username}): "${text.substring(0, 50)}..."`);
  }
});


// Періодична перевірка оголошень кожні 5 хвилин
setInterval(() => {
  sendListings().catch(err => log('error', `Глобальна помилка при виконанні sendListings: ${err.message}`));
}, 300000); // 5 хвилин

// Запуск бота
bot.launch()
  .then(() => {
    log('info', 'Бот успішно запущено! Очікуємо команд...');
    // Виконати першу перевірку одразу після запуску
    sendListings().catch(err => log('error', `Глобальна помилка при першому запуску sendListings: ${err.message}`));
  })
  .catch(err => log('error', `Помилка запуску бота: ${err.message}`));

// Зупинка бота на сигнали
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  log('info', 'Бот зупинено за SIGINT.');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  log('info', 'Бот зупинено за SIGTERM.');
});