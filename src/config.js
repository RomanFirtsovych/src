// src/config.js
module.exports = {
    SUBSCRIBERS_FILE: 'subscribers.json',
    PROCESSED_ADS_FILE: 'processedAds.json',
    USER_SETTINGS_FILE: 'userSettings.json',
    SESSION_FILE: 'session.json', // Для збереження сесій Telegraf
  
    // Мапінг районів Києва для OLX URL
    // Увага: перевіряйте URL-адреси на OLX для точного мапінгу
    DISTRICT_MAPPINGS: {
        'голосіївський': '1',
        'дарницький': '3',   // Приклад ID, який може бути правильним для Дарницького. ПЕРЕВІРТЕ!
        'деснянський': '4',  // Приклад ID
        'дніпровський': '5', // Приклад ID
        'оболонський': '6',  // Приклад ID
        'печерський': '7',   // Приклад ID
        'подільський': '8',  // Приклад ID
        'святошинський': '9',// Приклад ID
        'солом\'янський': '10',// Приклад ID
        'шевченківський': '11',// Приклад ID
        // Додайте інші райони за потребою, знайшовши їхні ID
      },
  
    // Мапінг типів тварин для OLX URL
    PETS_MAPPINGS: {
      'кіт': 'yes_cat',
      'коти': 'yes_cat',
      'собака': 'yes_dog',
      'собаки': 'yes_dog',
      'інші': 'yes_other',
      'інші тварини': 'yes_other',
    },
  
    // Стандартні налаштування для нового користувача
    DEFAULT_USER_SETTINGS: {
      city: 'київ',
      district: '', // За замовчуванням порожній, щоб не обмежуватись одним районом
      minPrice: 0,
      maxPrice: 0,
      keywords: [],
      maxFloor: 0,
      minArea: 0,
      petsAllowed: [],
    },
  
    // Налаштування для парсингу OLX
    OLX_MAX_PAGES_TO_PARSE: 3, // Максимальна кількість сторінок OLX для парсингу
    OLX_REQUEST_DELAY_MS: 1000, // Затримка між запитами до OLX (в мс) для rate limiting
  };