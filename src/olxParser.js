const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('./helpers');
const { DISTRICT_MAPPINGS, PETS_MAPPINGS, OLX_MAX_PAGES_TO_PARSE, OLX_REQUEST_DELAY_MS } = require('./config');

// Функція затримки для rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Функція для генерації URL-адреси OLX з фільтрами ---
function generateOlxUrl(settings, page = 1) {
  let url = 'https://www.olx.ua/uk/nedvizhimost/kvartiry/dolgosrochnaya-arenda-kvartir/';
  const params = new URLSearchParams();

  // Місто завжди додаємо як параметр, якщо воно не Київ,
  // або якщо є район (бо якщо є район, то шлях вже буде /kiev/, а не /kiev/район/)
  if (settings.city && settings.city.toLowerCase() === 'київ') {
    url += 'kiev/';
  } else if (settings.city) {
    const cityTransliterated = settings.city
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/і/g, 'i').replace(/ї/g, 'yi').replace(/є/g, 'ye')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    url += `${cityTransliterated}/`;
  }

  // ЗМІНИ ТУТ: Район тепер додається як search[district_id]
  if (settings.district) {
    const districtId = DISTRICT_MAPPINGS[settings.district.toLowerCase()];
    if (districtId) {
      params.append('search[district_id]', districtId);
    } else {
      log('warn', `Не знайдено OLX ID для району: ${settings.district}. Фільтр не буде застосовано.`);
    }
  }

  params.append('currency', 'UAH');

  if (settings.minPrice && settings.minPrice > 0) {
    params.append('search[filter_float_price:from]', settings.minPrice);
  }
  if (settings.maxPrice && settings.maxPrice > 0) {
    params.append('search[filter_float_price:to]', settings.maxPrice);
  }

  if (settings.maxFloor && settings.maxFloor > 0) {
    params.append('search[filter_float_floor:to]', settings.maxFloor);
  }

  if (settings.minArea && settings.minArea > 0) {
    params.append('search[filter_float_total_area:from]', settings.minArea);
  }

  if (settings.petsAllowed && settings.petsAllowed.length > 0) {
    settings.petsAllowed.forEach((petType, index) => {
      const olxPetValue = PETS_MAPPINGS[petType.toLowerCase()];
      if (olxPetValue) {
        params.append(`search[filter_enum_pets][${index}]`, olxPetValue);
      }
    });
  }

  if (settings.keywords && settings.keywords.length > 0) {
    params.append('search[keywords]', settings.keywords.join(' '));
  }

  // Додаємо параметр сторінки
  if (page > 1) {
    params.append('page', page);
  }

  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  log('debug', `Generated OLX URL (Page ${page}): ${url}`);
  return url;
}

// --- Парсер OLX через axios + cheerio ---
async function getOlxListingsFromUrl(url, processedAdsSet) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.olx.ua/', // Додаємо Referer, може допомогти
        'DNT': '1', // Do Not Track
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      maxRedirects: 5,
      timeout: 15000, // Збільшено таймаут на всякий випадок
    });

    const $ = cheerio.load(data);
    const newAds = [];
    let hasMorePages = false;

    // Перевірка на CAPTCHA або блокування
    if (data.includes('recaptcha') || data.includes('captcha') || data.includes('Продовжити')) {
      log('error', `OLX повернув CAPTCHA або сторінку блокування для URL: ${url}`);
      return { newAds: [], hasMorePages: false };
    }

    const nextPageLink = $('[data-testid="pagination-forward"]').attr('href');
    if (nextPageLink) {
      hasMorePages = true;
    }

    $('div[data-cy="l-card"]').each((_, el) => {
      const link = $(el).find('a').attr('href');
      if (!link) {
          log('debug', 'Пропущено оголошення без посилання.');
          return;
      }

      let fullLink = link.startsWith('http') ? link : `https://www.olx.ua${link}`;
      fullLink = fullLink.split('#')[0].split('?')[0];

      if (processedAdsSet.has(fullLink)) {
        return;
      }

      // *** ПОТЕНЦІЙНЕ ВИПРАВЛЕННЯ СЕЛЕКТОРА ЗАГОЛОВКА ***
      // OLX часто змінює структуру. Спробуйте ці варіанти,
      // якщо 'h6' все ще дає 'Без назви'.
      // Використовуйте інструменти розробника (F12) на OLX, щоб знайти правильний селектор.
      const titleElement = $(el).find('h6[data-testid="ad-card-title"], h6'); // Спробуємо конкретний data-testid або загальний h6
      const title = titleElement.text().trim() || 'Без назви'; // Додано .trim()

      const price = $(el).find('p[data-testid="ad-card-price"]').text().trim() || 'Ціна не вказана'; // Використовуємо data-testid
      const locationText = $(el).find('p[data-testid="location-date"]').text().trim() || ''; // Використовуємо data-testid

      let city = 'Невідомо';
      let district = 'Невідомо';

      const locationParts = locationText.split(',').map(part => part.trim());
      if (locationParts.length > 0) {
        city = locationParts[0];
        if (locationParts.length > 1) {
          district = locationParts[1];
        }
      }

      newAds.push({ id: fullLink, title, price, link: fullLink, city, district });
    });

    log('debug', `Парсинг сторінки: ${url}. Знайдено нових: ${newAds.length}. Є наступна сторінка: ${hasMorePages}`);
    return { newAds, hasMorePages };
  } catch (error) {
    log('error', `Помилка при отриманні оголошень з ${url}: ${error.message}`);
    if (error.response) {
      log('warn', `URL повернув статус ${error.response.status}: ${url}`);
    }
    return { newAds: [], hasMorePages: false };
  }
}

async function getAllOlxListings(settings, processedAdsSet) {
  let allNewListings = [];
  let currentPage = 1;
  let shouldContinue = true;

  while (shouldContinue && currentPage <= OLX_MAX_PAGES_TO_PARSE) {
    const url = generateOlxUrl(settings, currentPage);
    const { newAds, hasMorePages } = await getOlxListingsFromUrl(url, processedAdsSet);

    // Додаємо лише ті, які не були оброблені раніше (хоча getOlxListingsFromUrl вже фільтрує)
    for(const ad of newAds) {
        if (!processedAdsSet.has(ad.id)) { // Це дублююча перевірка, але не зашкодить
            allNewListings.push(ad);
        }
    }

    if (newAds.length === 0 || !hasMorePages) {
      shouldContinue = false;
    } else {
      currentPage++;
      await delay(OLX_REQUEST_DELAY_MS);
    }
  }
  log('info', `Завершено парсинг. Знайдено всього нових оголошень після пагінації: ${allNewListings.length}`);
  return allNewListings;
}

module.exports = {
  generateOlxUrl,
  getAllOlxListings,
};