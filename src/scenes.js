// src/scenes.js
const { Scenes, Markup } = require('telegraf');
const { log } = require('./helpers');
const { DEFAULT_USER_SETTINGS, DISTRICT_MAPPINGS, PETS_MAPPINGS } = require('./config');

// Функція для форматування налаштувань (дублюємо з bot.js для зручності)
function formatSettings(settings) {
  const s = { ...DEFAULT_USER_SETTINGS, ...settings }; // Гарантуємо, що всі поля є

  return `
🏙️ *Місто:* ${s.city ? s.city.charAt(0).toUpperCase() + s.city.slice(1) : 'не вказано'}
🏘️ *Район:* ${s.district ? s.district.charAt(0).toUpperCase() + s.district.slice(1) : 'не вказано'}
💸 *Мін. ціна:* ${s.minPrice > 0 ? s.minPrice : 'не вказано'}
💰 *Макс. ціна:* ${s.maxPrice > 0 ? s.maxPrice : 'не вказано'}
🔑 *Ключові слова:* ${s.keywords.length > 0 ? s.keywords.join(', ') : 'не вказано'}
⬆️ *Макс. поверх:* ${s.maxFloor > 0 ? s.maxFloor : 'без обмежень'}
📐 *Мін. площа:* ${s.minArea > 0 ? s.minArea : 'без обмежень'}
🐾 *Тварини:* ${s.petsAllowed.length > 0 ? s.petsAllowed.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : 'без обмежень'}
`.trim();
}

const SETTINGS_STEPS = {
  MAIN_MENU: 'main_menu',
  CITY: 'city',
  DISTRICT: 'district',
  MIN_PRICE: 'min_price',
  MAX_PRICE: 'max_price',
  KEYWORDS: 'keywords',
  MAX_FLOOR: 'max_floor',
  MIN_AREA: 'min_area',
  PETS: 'pets',
};

const filterWizard = new Scenes.WizardScene(
  'filter-wizard',
  // Крок 1: Головне меню фільтрів
  async (ctx) => {
    // Ініціалізуємо тимчасові налаштування з поточних користувацьких
    ctx.session.tempSettings = { ...(ctx.scene.state.userSettings || DEFAULT_USER_SETTINGS) };

    await ctx.reply(
      `⚙️ *Налаштування фільтрів:*\n\n${formatSettings(ctx.session.tempSettings)}\n\n` +
      `Оберіть параметр для зміни:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏙️ Місто', SETTINGS_STEPS.CITY)],
        [Markup.button.callback('🏘️ Район', SETTINGS_STEPS.DISTRICT)],
        [Markup.button.callback('💸 Мін. ціна', SETTINGS_STEPS.MIN_PRICE), Markup.button.callback('💰 Макс. ціна', SETTINGS_STEPS.MAX_PRICE)],
        [Markup.button.callback('🔑 Ключові слова', SETTINGS_STEPS.KEYWORDS)],
        [Markup.button.callback('⬆️ Макс. поверх', SETTINGS_STEPS.MAX_FLOOR), Markup.button.callback('📐 Мін. площа', SETTINGS_STEPS.MIN_AREA)],
        [Markup.button.callback('🐾 Тварини', SETTINGS_STEPS.PETS)],
        [Markup.button.callback('✅ Зберегти та вийти', 'save_and_exit'), Markup.button.callback('❌ Скасувати', 'cancel_wizard')],
      ]).resize()
    );
    return ctx.wizard.next(); // Переходимо на наступний крок (де чекаємо на відповідь)
  },

  // Крок 2: Обробка вибору користувача та перехід до відповідного кроку
  async (ctx) => {
    if (!ctx.callbackQuery) {
      // Якщо користувач надіслав текст замість натискання кнопки, повертаємо його на меню
      await ctx.reply('Будь ласка, оберіть дію за допомогою кнопок.');
      return ctx.wizard.selectStep(0); // Повертаємося до головного меню сцени
    }

    ctx.answerCbQuery(); // Відповідаємо на callbackQuery, щоб прибрати "годинник" з кнопки

    const action = ctx.callbackQuery.data;

    switch (action) {
      case SETTINGS_STEPS.CITY:
        await ctx.reply('Введіть назву міста (наприклад, "Київ"):');
        return ctx.wizard.next(); // Переходимо до кроку введення міста
      case SETTINGS_STEPS.DISTRICT:
        await ctx.reply('Введіть назву району (наприклад, "Дарницький"). Наразі підтримуються лише райони Києва. Залиште пустим для очищення:');
        return ctx.wizard.selectStep(3); // Переходимо до кроку введення району
      case SETTINGS_STEPS.MIN_PRICE:
        await ctx.reply('Введіть мінімальну ціну (число, наприклад, "10000"). Введіть "0" для очищення:');
        return ctx.wizard.selectStep(4); // Переходимо до кроку введення мін. ціни
      case SETTINGS_STEPS.MAX_PRICE:
        await ctx.reply('Введіть максимальну ціну (число, наприклад, "20000"). Введіть "0" для очищення:');
        return ctx.wizard.selectStep(5); // Переходимо до кроку введення макс. ціни
      case SETTINGS_STEPS.KEYWORDS:
        await ctx.reply('Введіть ключові слова через кому (наприклад, "ремонт, балкон"). Залиште пустим для очищення:');
        return ctx.wizard.selectStep(6); // Переходимо до кроку введення ключових слів
      case SETTINGS_STEPS.MAX_FLOOR:
        await ctx.reply('Введіть максимальний поверх (число, наприклад, "9"). Введіть "0" для очищення:');
        return ctx.wizard.selectStep(7); // Переходимо до кроку введення макс. поверху
      case SETTINGS_STEPS.MIN_AREA:
        await ctx.reply('Введіть мінімальну площу (число, наприклад, "38"). Введіть "0" для очищення:');
        return ctx.wizard.selectStep(8); // Переходимо до кроку введення мін. площі
      case SETTINGS_STEPS.PETS:
        await ctx.reply(
          'Оберіть дозволених тварин (можна декілька). Натисніть "Завершити", коли оберете все.\n\n_Поточні: ' +
          (ctx.session.tempSettings.petsAllowed.length > 0 ? ctx.session.tempSettings.petsAllowed.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : 'Немає') + '_',
          Markup.inlineKeyboard([
            [Markup.button.callback('🐈 Кіт', 'add_pet_cat'), Markup.button.callback('🐕 Собака', 'add_pet_dog')],
            [Markup.button.callback('🐇 Інші тварини', 'add_pet_other'), Markup.button.callback('❌ Очистити', 'clear_pets')],
            [Markup.button.callback('✅ Завершити вибір тварин', 'finish_pets')],
          ]).resize()
        );
        return ctx.wizard.selectStep(9); // Переходимо до кроку вибору тварин
      case 'save_and_exit':
        ctx.scene.state.saveSettings(ctx.session.tempSettings); // Викликаємо функцію збереження з bot.js
        await ctx.reply(`✅ *Налаштування збережено!* 🎯\n${formatSettings(ctx.session.tempSettings)}`, { parse_mode: 'Markdown' });
        return ctx.scene.leave();
      case 'cancel_wizard':
        await ctx.reply('❌ Налаштування скасовано.');
        return ctx.scene.leave();
      default:
        await ctx.reply('Невідома дія. Будь ласка, оберіть дію з меню.');
        return ctx.wizard.selectStep(0);
    }
  },

  // Крок 3: Введення міста
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Будь ласка, введіть назву міста текстом.');
      return; // Залишаємося на цьому кроці
    }
    const city = ctx.message.text.trim();
    ctx.session.tempSettings.city = city;
    await ctx.reply(`Місто встановлено: *${city}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.selectStep(0); // Повертаємося до головного меню
  },

  // Крок 4: Введення району
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Будь ласка, введіть назву району текстом або "0" для очищення.');
      return;
    }
    const districtInput = ctx.message.text.trim();
    if (districtInput === '0' || districtInput === '') {
      ctx.session.tempSettings.district = '';
      await ctx.reply('Район очищено.');
    } else {
      const normalizedDistrict = districtInput.toLowerCase();
      if (DISTRICT_MAPPINGS[normalizedDistrict]) {
        ctx.session.tempSettings.district = normalizedDistrict;
        await ctx.reply(`Район встановлено: *${districtInput}*`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('Наразі цей район не підтримується або назва введена неправильно. Спробуйте інший район Києва або залиште пустим.');
        return; // Залишаємося на цьому кроці
      }
    }
    return ctx.wizard.selectStep(0);
  },

  // Крок 5: Введення мін. ціни
  async (ctx) => {
    if (!ctx.message || !ctx.message.text || isNaN(parseInt(ctx.message.text.trim()))) {
      await ctx.reply('Будь ласка, введіть числове значення для мінімальної ціни. Введіть "0" для очищення.');
      return;
    }
    const price = parseInt(ctx.message.text.trim());
    ctx.session.tempSettings.minPrice = price;
    await ctx.reply(`Мін. ціна встановлена: *${price > 0 ? price : 'без обмежень'}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.selectStep(0);
  },

  // Крок 6: Введення макс. ціни
  async (ctx) => {
    if (!ctx.message || !ctx.message.text || isNaN(parseInt(ctx.message.text.trim()))) {
      await ctx.reply('Будь ласка, введіть числове значення для максимальної ціни. Введіть "0" для очищення.');
      return;
    }
    const price = parseInt(ctx.message.text.trim());
    ctx.session.tempSettings.maxPrice = price;
    await ctx.reply(`Макс. ціна встановлена: *${price > 0 ? price : 'без обмежень'}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.selectStep(0);
  },

  // Крок 7: Введення ключових слів
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Будь ласка, введіть ключові слова через кому або "0" для очищення.');
      return;
    }
    const keywordsInput = ctx.message.text.trim();
    if (keywordsInput === '0' || keywordsInput === '') {
      ctx.session.tempSettings.keywords = [];
      await ctx.reply('Ключові слова очищено.');
    } else {
      ctx.session.tempSettings.keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
      await ctx.reply(`Ключові слова встановлено: *${ctx.session.tempSettings.keywords.join(', ')}*`, { parse_mode: 'Markdown' });
    }
    return ctx.wizard.selectStep(0);
  },

  // Крок 8: Введення макс. поверху
  async (ctx) => {
    if (!ctx.message || !ctx.message.text || isNaN(parseInt(ctx.message.text.trim()))) {
      await ctx.reply('Будь ласка, введіть числове значення для максимального поверху. Введіть "0" для очищення.');
      return;
    }
    const floor = parseInt(ctx.message.text.trim());
    ctx.session.tempSettings.maxFloor = floor;
    await ctx.reply(`Макс. поверх встановлено: *${floor > 0 ? floor : 'без обмежень'}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.selectStep(0);
  },

  // Крок 9: Введення мін. площі
  async (ctx) => {
    if (!ctx.message || !ctx.message.text || isNaN(parseInt(ctx.message.text.trim()))) {
      await ctx.reply('Будь ласка, введіть числове значення для мінімальної площі. Введіть "0" для очищення.');
      return;
    }
    const area = parseInt(ctx.message.text.trim());
    ctx.session.tempSettings.minArea = area;
    await ctx.reply(`Мін. площа встановлена: *${area > 0 ? area : 'без обмежень'}*`, { parse_mode: 'Markdown' });
    return ctx.wizard.selectStep(0);
  },

  // Крок 10: Вибір тварин
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('Будь ласка, використовуйте кнопки для вибору тварин.');
      return;
    }
    ctx.answerCbQuery();
    const action = ctx.callbackQuery.data;

    const currentPets = ctx.session.tempSettings.petsAllowed;

    switch (action) {
      case 'add_pet_cat':
        if (!currentPets.includes('кіт')) currentPets.push('кіт');
        break;
      case 'add_pet_dog':
        if (!currentPets.includes('собака')) currentPets.push('собака');
        break;
      case 'add_pet_other':
        if (!currentPets.includes('інші')) currentPets.push('інші');
        break;
      case 'clear_pets':
        ctx.session.tempSettings.petsAllowed = [];
        await ctx.reply('Фільтр "Тварини" очищено.');
        return ctx.wizard.selectStep(0); // Повертаємось до головного меню після очищення
      case 'finish_pets':
        await ctx.reply(`Фільтр "Тварини" оновлено: *${currentPets.length > 0 ? currentPets.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : 'без обмежень'}*`, { parse_mode: 'Markdown' });
        return ctx.wizard.selectStep(0); // Повертаємося до головного меню
      default:
        await ctx.reply('Невідома дія.');
        break;
    }

    ctx.session.tempSettings.petsAllowed = currentPets;

    // Відправляємо оновлене меню тварин
    await ctx.editMessageText(
      'Оберіть дозволених тварин (можна декілька). Натисніть "Завершити", коли оберете все.\n\n_Поточні: ' +
      (ctx.session.tempSettings.petsAllowed.length > 0 ? ctx.session.tempSettings.petsAllowed.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : 'Немає') + '_',
      Markup.inlineKeyboard([
        [Markup.button.callback('🐈 Кіт', 'add_pet_cat'), Markup.button.callback('🐕 Собака', 'add_pet_dog')],
        [Markup.button.callback('🐇 Інші тварини', 'add_pet_other'), Markup.button.callback('❌ Очистити', 'clear_pets')],
        [Markup.button.callback('✅ Завершити вибір тварин', 'finish_pets')],
      ]).resize()
    );
  }
);

module.exports = {
  filterWizard,
  formatSettings, // Експортуємо для використання в bot.js
};