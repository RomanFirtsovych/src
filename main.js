const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const SUBSCRIBERS_FILE = 'subscribers.json';
const PROCESSED_ADS_FILE = 'processedAds.json';

let subscribers = loadJSON(SUBSCRIBERS_FILE, []);
let processedAds = new Set(loadJSON(PROCESSED_ADS_FILE, []));

// 🛠️ Функція для безпечного читання JSON
function loadJSON(file, defaultValue) {
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (error) {
            console.error(`❌ Помилка читання ${file}:`, error);
        }
    }
    return defaultValue;
}

// 💾 Функція для безпечного запису JSON
function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error(`❌ Помилка запису ${file}:`, error);
    }
}

// ⏳ Функція перевірки часу публікації (не старше 2 днів)
function isRecentlyPublished(timeText) {
    if (!timeText) return false;

    if (timeText.includes('Щойно')) return true;

    const minutesMatch = timeText.match(/(\d+)\s*хв/);
    if (minutesMatch) return parseInt(minutesMatch[1], 10) <= 2880;

    const hoursMatch = timeText.match(/(\d+)\s*год/);
    if (hoursMatch) return parseInt(hoursMatch[1], 10) <= 48;

    const daysMatch = timeText.match(/(\d+)\s*дн/);
    if (daysMatch) return parseInt(daysMatch[1], 10) <= 2;

    return false;
}

// 🔍 Функція отримання оголошень з OLX (по 10 штук за раз)
async function getOlxListings() {
    console.log('🔍 Виконуємо парсинг OLX...');
    let browser;

    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        const url = 'https://www.olx.ua/uk/nedvizhimost/arenda-kvartir/';
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Чекаємо на завантаження першого оголошення
        await page.waitForSelector('div[data-cy="l-card"]', { timeout: 5000 });

        let listings = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div[data-cy="l-card"]')).map(el => {
                const title = el.querySelector('h6')?.innerText || 'Без назви';
                const price = el.querySelector('p')?.innerText || 'Ціна не вказана';
                const link = el.querySelector('a')?.href || '#';
                const locationText = el.querySelector('p[data-testid="location-date"]')?.innerText || '';
                const description = el.querySelector('span[data-testid="ad-description"]')?.innerText || '';

                let locationParts = locationText.split(',');
                let city = locationParts.length > 0 ? locationParts[0].trim() : '';
                let district = locationParts.length > 1 ? locationParts[1].trim() : '';

                return { id: link, title, price, link, city, district, description, timeText: locationText };
            });
        });

        console.log(`✅ Отримано ${listings.length} оголошень`);

        // Відфільтровуємо лише ті, які ще не обробляли
        let newListings = listings.filter(ad => !processedAds.has(ad.id));

        console.log(`🆕 Нових оголошень для перевірки: ${newListings.length}`);

        let filteredListings = [];
        for (let i = 0; i < newListings.length; i += 10) {
            let batch = newListings.slice(i, i + 10);

            for (let ad of batch) {
                if (processedAds.has(ad.id)) {
                    console.log(`⏩ Вже перевірено раніше: ${ad.title}`);
                    continue;
                }

                if (ad.city.toLowerCase() !== 'київ') {
                    console.log(`⏩ Не Київ: ${ad.title}`);
                    processedAds.add(ad.id);
                    continue;
                }

                if (!ad.district.toLowerCase().includes('дарницький')) {
                    console.log(`⏩ Не Дарницький район: ${ad.title}`);
                    processedAds.add(ad.id);
                    continue;
                }

                if (!isRecentlyPublished(ad.timeText)) {
                    console.log(`⏩ Не нове оголошення: ${ad.title}`);
                    processedAds.add(ad.id);
                    continue;
                }

                console.log(`✅ Додаємо в список для відправки: ${ad.title}`);
                filteredListings.push(ad);
                processedAds.add(ad.id);
            }

            saveJSON(PROCESSED_ADS_FILE, [...processedAds]); // Зберігаємо оновлений список перевірених
        }

        return filteredListings;

    } catch (error) {
        console.error('❌ Помилка при отриманні оголошень:', error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

// 📩 Відправка оголошень підписникам
async function sendListings() {
    const listings = await getOlxListings();
    
    if (listings.length === 0) {
        console.log('❗ Немає нових оголошень');
        return;
    }

    if (subscribers.length === 0) {
        console.log('⚠️ Немає підписників.');
        return;
    }

    listings.forEach(ad => {
        subscribers.forEach(userId => {
            bot.telegram.sendMessage(
                userId,
                `🏡 *${ad.title}*\n📍 *${ad.city}, ${ad.district}*\n⏳ *${ad.timeText}*\n💰 ${ad.price}\n🔗 [Детальніше](${ad.link})`,
                { parse_mode: 'Markdown' }
            ).catch(error => console.error('❌ Помилка відправки повідомлення:', error));
        });
    });

    console.log(`📩 Відправлено ${listings.length} оголошень підписникам`);
}

// 🔁 Запуск автоматичного парсингу кожні **30 секунд**
setInterval(sendListings, 30000);

// 📢 Команда /start для підписки
bot.start((ctx) => {
    const userId = ctx.message.chat.id;
    if (!subscribers.includes(userId)) {
        subscribers.push(userId);
        saveJSON(SUBSCRIBERS_FILE, subscribers);
        ctx.reply('✅ Ви підписалися на оновлення квартир у Дарницькому районі Києва! Оголошення будуть надходити автоматично.');
    } else {
        ctx.reply('❗ Ви вже підписані.');
    }
});

// 🚀 Запуск бота
bot.launch()
    .then(() => console.log('🤖 Бот запущено!'))
    .catch(err => console.error('❌ Помилка запуску бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
