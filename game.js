// ===== КОНФИГУРАЦИЯ ИГРЫ =====
const CONFIG = {
    BOARD_SIZE: 4,
    TOTAL_CELLS: 16,
    MAX_ITEM_LEVEL: 10,
    MAX_USER_LEVEL: 100,
    XP_PER_LEVEL: 1000,
    ENERGY_MAX: 50,
    ENERGY_RESTORE_TIME: 1 * 60 * 1000, // 10 минут
    ITEM_COST: 5,
    SAVE_INTERVAL: 30000,
    LOCAL_STORAGE_KEY: 'crafting_game_full_v3'
};

// ===== XP ЗА СКРЕЩИВАНИЕ =====
const COMBINE_XP = {
    1: 10, 2: 20, 3: 40, 4: 80, 5: 160,
    6: 320, 7: 640, 8: 1280, 9: 2560, 10: 5120
};

// ===== XP И ЭНЕРГИЯ ЗА ПРОДАЖУ =====
const SELL_REWARDS = {
    xp: {1:1,2:2,3:4,4:8,5:16,6:32,7:64,8:128,9:256,10:512},
    energy: {1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10}
};

// ===== ВЕРОЯТНОСТИ СОЗДАНИЯ ПРЕДМЕТОВ =====
const CREATE_PROBABILITIES = {
    1: [1],
    50: [1, 2, 3],
    70: [1, 2, 3, 4]
};

// ===== ЦВЕТА ДЛЯ УРОВНЕЙ =====
const LEVEL_COLORS = [
    '#6c5ce7', '#00b894', '#fd79a8', '#fdcb6e',
    '#e17055', '#0984e3', '#00cec9', '#a29bfe',
    '#ffeaa7', '#ff7675'
];

// ===== ПУТЬ К ИЗОБРАЖЕНИЯМ ПРЕДМЕТОВ =====
const ITEM_IMAGE_PATH = 'images/item_{level}.png';

// ===== ПУТЬ К ЗАГРУЗОЧНЫМ ИЗОБРАЖЕНИЯМ =====
const LOADING_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDVWNCIgZmlsbD0iIzZDNUFFNyI+CiAgPGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ic3Ryb2tlIiB2YWx1ZXM9IiM2QzVBRTcgOyM4M0M3RjkgOyM2QzVBRTciIGR1cj0iMXMiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIi8+CiAgPGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ib3BhY2l0eSIgdmFsdWVzPSIxOzAuNTsxIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIvPgo8L3BhdGg+Cjwvc3ZnPg==';

// ===== ПОЛУЧЕНИЕ ПУТИ К ИЗОБРАЖЕНИЮ ПРЕДМЕТА =====
function getItemImageUrl(item) {
    if (!item) return LOADING_IMAGE;
    const url = `images/item_${item.level}.png`;
    return url;
}

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let gameBoard = [];
let dragSourceIndex = null;
let isMobile = false;
let dragElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let selectedItemIndex = null;
let energyTimerInterval = null;
let isDragging = false;
let isProcessing = false; // Защита от двойного клика
let imageCache = new Map();

// Данные игрока
let userData = {
    level: 1,
    xp: 0,
    energy: 50,
    lastEnergyUpdate: Date.now()
};

// ===== ПРЕЗАГРУЗКА ИЗОБРАЖЕНИЙ =====
function preloadImages() {
    console.log('=== ПРЕЗАГРУЗКА ИЗОБРАЖЕНИЙ ===');
    
    for (let level = 1; level <= CONFIG.MAX_ITEM_LEVEL; level++) {
        const img = new Image();
        const url = `images/item_${level}.png`;
        
        console.log(`Загрузка: ${url}`);
        
        img.src = url;
        img.onload = () => {
            console.log(`✓ ${url} загружено`);
            imageCache.set(level, img.src);
        };
        img.onerror = () => {
            console.warn(`✗ ${url} не найден`);
        };
    }
}
// ===== ПРОВЕРКА И ПОДДЕРЖКА ВИБРАЦИИ =====
function supportsVibration() {
    // Проверяем поддержку вибрации в браузере ИЛИ в Telegram WebApp
    return 'vibrate' in navigator || 
           (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.HapticFeedback);
}

function vibrate(pattern) {
    if (!supportsVibration() || isProcessing) return;
    
    try {
        // Telegram Mini Apps
        if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.HapticFeedback) {
            if (pattern === 50 || (Array.isArray(pattern) && pattern[0] === 50)) {
                Telegram.WebApp.HapticFeedback.impactOccurred('light');
            } else if (pattern === 100 || (Array.isArray(pattern) && pattern[0] === 100)) {
                Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            } else if (pattern === 200 || (Array.isArray(pattern) && pattern[0] === 200)) {
                Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
            } else if (Array.isArray(pattern) && pattern.length > 2) {
                // Для сложных паттернов используем notificationOccurred
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        }
        // Обычный браузер
        else if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    } catch (error) {
        console.warn('Ошибка вибрации:', error);
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM MINI APP =====
function initTelegramApp() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        try {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();
            Telegram.WebApp.setBackgroundColor('#0a0a0f');
            Telegram.WebApp.setHeaderColor('#0a0a0f');
            
            // Загружаем данные пользователя
            loadTelegramUserData();
            
            // Тест вибрации при запуске (опционально)
            setTimeout(() => {
                if (supportsVibration()) {
                    console.log('Вибрация доступна в Telegram Mini App');
                }
            }, 1000);
            
            // Обработка смены темы
            Telegram.WebApp.onEvent('themeChanged', updateTheme);
            updateTheme();
            
            // Обработка закрытия
            Telegram.WebApp.onEvent('viewportChanged', () => {
                if (Telegram.WebApp.isExpanded) {
                    Telegram.WebApp.MainButton.hide();
                }
            });
        } catch (error) {
            console.warn('Telegram Web App не доступен');
        }
    }
}
// ===== ОБРАБОТКА ОБНОВЛЕНИЙ ПРОФИЛЯ =====
function setupTelegramProfileUpdates() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        // Можно слушать события изменения профиля
        Telegram.WebApp.onEvent('themeChanged', () => {
            // При смене темы можно обновить что-то
        });
        
        // Проверяем данные периодически (на случай обновления аватара)
        setInterval(() => {
            const user = Telegram.WebApp.initDataUnsafe?.user;
            if (user && window.telegramUser && user.photo_url !== window.telegramUser.photo_url) {
                console.log('Аватар пользователя обновился');
                updateTelegramAvatar(user);
                window.telegramUser = user;
            }
        }, 30000); // Каждые 30 секунд
    }
}
// ===== ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ TELEGRAM =====
function loadTelegramUserData() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        try {
            const user = Telegram.WebApp.initDataUnsafe?.user;
            
            if (user) {
                console.log('Данные пользователя Telegram:', user);
                
                // Обновляем аватар
                updateTelegramAvatar(user);
                
                // Можно сохранить данные пользователя для дальнейшего использования
                window.telegramUser = user;
                
                return user;
            } else {
                console.log('Данные пользователя Telegram не доступны');
                return null;
            }
        } catch (error) {
            console.warn('Ошибка загрузки данных пользователя Telegram:', error);
            return null;
        }
    }
    return null;
}
// ===== ЗАГРУЗКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ TELEGRAM =====
function loadTelegramUserData() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        try {
            const user = Telegram.WebApp.initDataUnsafe?.user;
            
            if (user) {
                console.log('Данные пользователя Telegram:', user);
                
                // Обновляем аватар
                updateTelegramAvatar(user);
                
                // Можно сохранить данные пользователя для дальнейшего использования
                window.telegramUser = user;
                
                return user;
            } else {
                console.log('Данные пользователя Telegram не доступны');
                // Показываем случайный аватар для демо
                showDemoAvatar();
                return null;
            }
        } catch (error) {
            console.warn('Ошибка загрузки данных пользователя Telegram:', error);
            showDemoAvatar();
            return null;
        }
    } else {
        // Веб-версия: показываем демо-аватар
        showDemoAvatar();
        return null;
    }
}

// ===== ДЕМО-АВАТАР ДЛЯ ВЕБ-ВЕРСИИ =====
function showDemoAvatar() {
    const placeholder = document.querySelector('.avatar-placeholder');
    if (!placeholder) return;
    
    // Случайный цвет и инициал
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];
    const colors = [
        'linear-gradient(135deg, #FF3366, #FF0066)',
        'linear-gradient(135deg, #00CCFF, #0066FF)',
        'linear-gradient(135deg, #00B894, #00D8A7)',
        'linear-gradient(135deg, #FFCC00, #FF9900)'
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    placeholder.textContent = randomLetter;
    placeholder.style.fontSize = '18px';
    placeholder.style.fontWeight = '700';
    placeholder.style.background = randomColor;
}

// ===== ОБНОВЛЕНИЕ АВАТАРА TELEGRAM =====
function updateTelegramAvatar(user) {
    const avatarElement = document.getElementById('telegramAvatar');
    const placeholder = document.querySelector('.avatar-placeholder');
    
    if (!avatarElement || !placeholder) return;
    
    // Если есть фото профиля
    if (user.photo_url) {
        // Создаем изображение для загрузки
        const img = new Image();
        
        img.onload = () => {
            // Показываем реальную аватарку
            avatarElement.src = user.photo_url;
            avatarElement.style.display = 'block';
            placeholder.style.display = 'none';
            
            // Добавляем эффект появления
            avatarElement.style.opacity = '0';
            setTimeout(() => {
                avatarElement.style.opacity = '1';
                avatarElement.style.transition = 'opacity 0.3s ease';
            }, 100);
        };
        
        img.onerror = () => {
            // Если ошибка загрузки, показываем инициалы
            showUserInitials(user);
        };
        
        img.src = user.photo_url;
        
    } else if (user.first_name) {
        // Если нет фото, показываем инициалы
        showUserInitials(user);
    }
}

// ===== ПОКАЗАТЬ ИНИЦИАЛЫ ПОЛЬЗОВАТЕЛЯ =====
function showUserInitials(user) {
    const placeholder = document.querySelector('.avatar-placeholder');
    if (!placeholder) return;
    
    let initials = '';
    
    if (user.first_name) {
        initials += user.first_name.charAt(0).toUpperCase();
    }
    
    if (user.last_name) {
        initials += user.last_name.charAt(0).toUpperCase();
    }
    
    // Если есть только username
    if (!initials && user.username) {
        initials = user.username.charAt(0).toUpperCase();
    }
    
    // Если вообще ничего нет
    if (!initials) {
        initials = '👤';
    }
    
    placeholder.textContent = initials;
    placeholder.style.fontSize = '18px';
    placeholder.style.fontWeight = '700';
    placeholder.style.background = generateUserColor(user.id || Date.now());
}

// ===== ГЕНЕРАЦИЯ ЦВЕТА ДЛЯ АВАТАРА =====
function generateUserColor(userId) {
    const colors = [
        'linear-gradient(135deg, #FF3366, #FF0066)', // Красный
        'linear-gradient(135deg, #00CCFF, #0066FF)', // Синий
        'linear-gradient(135deg, #00B894, #00D8A7)', // Зеленый
        'linear-gradient(135deg, #FFCC00, #FF9900)', // Желтый
        'linear-gradient(135deg, #9B59B6, #8E44AD)', // Фиолетовый
        'linear-gradient(135deg, #FF7675, #FD79A8)', // Розовый
        'linear-gradient(135deg, #00CEC9, #00B4D8)', // Бирюзовый
        'linear-gradient(135deg, #FDCB6E, #E17055)'  // Оранжевый
    ];
    
    // Генерируем индекс на основе ID пользователя
    const index = Math.abs(userId) % colors.length;
    return colors[index];
}

// ===== ОБНОВЛЕНИЕ ИМЕНИ ПОЛЬЗОВАТЕЛЯ (опционально) =====
function updateUserName(user) {
    // Можно добавить отображение имени пользователя
    if (user.first_name) {
        const nameElement = document.createElement('div');
        nameElement.className = 'user-name';
        nameElement.textContent = user.first_name;
        nameElement.style.fontSize = '14px';
        nameElement.style.fontWeight = '600';
        nameElement.style.color = 'var(--text-primary)';
        nameElement.style.marginTop = '4px';
        
        const userInfo = document.querySelector('.user-info');
        if (userInfo) {
            // Добавляем после уровня
            const levelDiv = userInfo.querySelector('.level-number').parentNode;
            if (levelDiv.nextSibling) {
                userInfo.insertBefore(nameElement, levelDiv.nextSibling);
            } else {
                userInfo.appendChild(nameElement);
            }
        }
    }
}

// ===== ОБНОВЛЕНИЕ ТЕМЫ TELEGRAM =====
function updateTheme() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        const theme = Telegram.WebApp.colorScheme;
        document.documentElement.style.setProperty('--telegram-bg', theme === 'dark' ? '#0a0a0f' : '#ffffff');
        document.documentElement.style.setProperty('--telegram-text', theme === 'dark' ? '#ffffff' : '#000000');
    }
}

// ===== ОПРЕДЕЛЕНИЕ УСТРОЙСТВА =====
function detectDevice() {
    // Telegram Mini Apps всегда на мобильных устройствах
    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
        isMobile = true;
        console.log('Telegram Mini App - мобильное устройство');
    } else {
        isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent);
    }
    
    // Добавляем класс для улучшения touch
    if (isMobile) {
        document.body.classList.add('is-mobile');
    }
}

// ===== ГЕНЕРАЦИЯ НОВОГО ПРЕДМЕТА =====
function generateNewItem() {
    const userLevel = userData.level;
    let possibleLevels = [1];
    
    if (userLevel >= 70) {
        possibleLevels = CREATE_PROBABILITIES[70];
    } else if (userLevel >= 50) {
        possibleLevels = CREATE_PROBABILITIES[50];
    }
    
    const randomLevel = possibleLevels[Math.floor(Math.random() * possibleLevels.length)];
    
    return {
        id: Date.now() + Math.random(),
        level: randomLevel,
        createdAt: Date.now()
    };
}

// ===== СКРЕЩИВАНИЕ ПРЕДМЕТОВ =====
function combineItems(item1, item2) {
    if (!item1 || !item2 || isProcessing) return null;
    
    // Проверяем, одинаковые ли уровни
    if (item1.level === item2.level) {
        const newLevel = item1.level + 1;
        
        // Проверяем, не превышен ли максимальный уровень
        if (newLevel > CONFIG.MAX_ITEM_LEVEL) {
            // Если достигнут максимальный уровень, предметы не скрещиваются
            console.log(`Достигнут максимальный уровень (${CONFIG.MAX_ITEM_LEVEL})`);
            return null;
        }
        
        // Начисляем опыт за скрещивание
        const xpGained = COMBINE_XP[item1.level] || 0;
        addXP(xpGained);
        
        // Возвращаем новый предмет с более высоким уровнем
        return {
            id: Date.now() + Math.random(),
            level: newLevel,
            createdAt: Date.now()
        };
    }
    
    // Если уровни разные - предметы не скрещиваются
    return null;
}

// ===== ДОБАВЛЕНИЕ ОПЫТА =====
function addXP(amount) {
    if (amount <= 0) return;
    
    userData.xp += amount;
    
    while (userData.xp >= CONFIG.XP_PER_LEVEL && userData.level < CONFIG.MAX_USER_LEVEL) {
        userData.xp -= CONFIG.XP_PER_LEVEL;
        userData.level++;
        userData.energy = Math.min(userData.energy + 10, CONFIG.ENERGY_MAX);
        showLevelUpNotification();
    }
    
    updateUserStats();
    saveGameState();
}

// ===== УВЕДОМЛЕНИЕ О ПОВЫШЕНИИ УРОВНЯ =====
function showLevelUpNotification() {
    vibrate([150, 100, 150, 100, 150]);
    const notification = document.createElement('div');
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, rgba(108, 92, 231, 0.95), rgba(162, 155, 254, 0.95));
        color: white;
        padding: 20px 40px;
        border-radius: 20px;
        font-size: 24px;
        font-weight: 700;
        z-index: 10000;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        animation: levelUpAnimation 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    notification.textContent = `🎉 Уровень ${userData.level}!`;
    document.body.appendChild(notification);
    
    // Анимация
    const style = document.createElement('style');
    style.textContent = `
        @keyframes levelUpAnimation {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            70% { transform: translate(-50%, -50%) scale(1.1); }
            100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notification.remove();
        style.remove();
    }, 2000);
}

// ===== ПОЛУЧЕНИЕ ЦВЕТА ДЛЯ УРОВНЯ =====
function getLevelColor(level) {
    const index = Math.min(level - 1, LEVEL_COLORS.length - 1);
    return LEVEL_COLORS[index] || LEVEL_COLORS[0];
}

// ===== ТАЙМЕР ВОССТАНОВЛЕНИЯ ЭНЕРГИИ =====
function updateEnergyTimer() {
    const now = Date.now();
    const timeSinceLastUpdate = now - userData.lastEnergyUpdate;
    const timeUntilNextEnergy = CONFIG.ENERGY_RESTORE_TIME - timeSinceLastUpdate;
    
    if (userData.energy >= CONFIG.ENERGY_MAX) {
        document.getElementById('energyTimer').textContent = 'MAX';
        document.getElementById('energyProgress').style.width = '100%';
        userData.lastEnergyUpdate = now; // Сбрасываем таймер при максимальной энергии
        return;
    }
    
    if (timeUntilNextEnergy > 0) {
        const minutes = Math.floor(timeUntilNextEnergy / 60000);
        const seconds = Math.floor((timeUntilNextEnergy % 60000) / 1000);
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('energyTimer').textContent = timeStr;
        
        const progressPercent = 100 - (timeUntilNextEnergy / CONFIG.ENERGY_RESTORE_TIME * 100);
        document.getElementById('energyProgress').style.width = `${progressPercent}%`;
    } else {
        // Добавляем энергию
        userData.energy = Math.min(userData.energy + 1, CONFIG.ENERGY_MAX);
        userData.lastEnergyUpdate = now;
        document.getElementById('energyTimer').textContent = '00:00';
        document.getElementById('energyProgress').style.width = '100%';
        updateUserStats();
        saveGameState();
    }
}

function startEnergyTimer() {
    if (energyTimerInterval) clearInterval(energyTimerInterval);
    updateEnergyTimer();
    energyTimerInterval = setInterval(updateEnergyTimer, 1000);
}

// ===== ОБНОВЛЕНИЕ СТАТИСТИК ПОЛЬЗОВАТЕЛЯ =====
function updateUserStats() {
    // Уровень игрока
    document.getElementById('userLevel').textContent = userData.level;
    
    // XP бар
    const xpPercent = (userData.xp / CONFIG.XP_PER_LEVEL) * 100;
    const xpBar = document.getElementById('xpBar');
    xpBar.style.width = `${Math.min(xpPercent, 100)}%`;
    xpBar.setAttribute('aria-valuenow', userData.xp);
    xpBar.setAttribute('aria-valuemax', CONFIG.XP_PER_LEVEL);
    
    document.getElementById('xpText').textContent = `${userData.xp} / ${CONFIG.XP_PER_LEVEL}`;
    
    // Энергия
    document.getElementById('energyValue').textContent = userData.energy;
    
    // Обновляем состояние кнопки создания
    const createBtn = document.getElementById('createBtn');
    if (createBtn) {
        const isDisabled = userData.energy < CONFIG.ITEM_COST;
        createBtn.disabled = isDisabled;
        createBtn.setAttribute('aria-disabled', isDisabled);
    }
    
    // Запускаем/обновляем таймер
    startEnergyTimer();
}

// ===== ВОССТАНОВЛЕНИЕ ЭНЕРГИИ =====
function updateEnergy() {
    const now = Date.now();
    const timePassed = now - userData.lastEnergyUpdate;
    const energyToAdd = Math.floor(timePassed / CONFIG.ENERGY_RESTORE_TIME);
    
    if (energyToAdd > 0 && userData.energy < CONFIG.ENERGY_MAX) {
        userData.energy = Math.min(userData.energy + energyToAdd, CONFIG.ENERGY_MAX);
        userData.lastEnergyUpdate = now - (timePassed % CONFIG.ENERGY_RESTORE_TIME);
        updateUserStats();
        saveGameState();
    }
}

// ===== СОЗДАНИЕ ПРЕДМЕТА =====
function createItem() {
    if (isProcessing) return;
    isProcessing = true;
    
    if (userData.energy < CONFIG.ITEM_COST) {
        console.warn('Недостаточно энергии');
        showNotification('Недостаточно энергии!', 'error');
        vibrate([100, 50, 100]);
        isProcessing = false;
        return;
    }
    
    const emptyCellIndex = findEmptyCell();
    if (emptyCellIndex === -1) {
        console.warn('Нет свободных ячеек');
        showNotification('Нет свободных ячеек!', 'error');
        vibrate([100, 50, 100]);
        isProcessing = false;
        return;
    }
    
    // Анимация загрузки
    const createBtn = document.getElementById('createBtn');
    const originalHTML = createBtn.innerHTML;
    createBtn.innerHTML = '<div class="spinner"></div>';
    createBtn.disabled = true;
    
    userData.energy -= CONFIG.ITEM_COST;
    const newItem = generateNewItem();
    gameBoard[emptyCellIndex] = newItem;
    
    setTimeout(() => {
        vibrate([100, 50, 100]);
        renderGameBoard();
        updateUserStats();
        saveGameState();
        animateItemAppear(emptyCellIndex);
        
        // Восстанавливаем кнопку
        createBtn.innerHTML = originalHTML;
        createBtn.disabled = userData.energy < CONFIG.ITEM_COST;
        isProcessing = false;
    }, 500);
}

// ===== ПРОДАЖА ПРЕДМЕТА =====
function sellItem(itemIndex) {
    if (isProcessing) return;
    isProcessing = true;
    
    const item = gameBoard[itemIndex];
    if (!item) {
        isProcessing = false;
        return;
    }
    
    const xpReward = SELL_REWARDS.xp[item.level] || 0;
    const energyReward = SELL_REWARDS.energy[item.level] || 0;
    
    addXP(xpReward);
    userData.energy += energyReward;
    gameBoard[itemIndex] = null;

    vibrate([30, 20, 30, 20]);
    
    // Показываем награду
    showNotification(`+${xpReward} XP, +${energyReward} энергии`, 'success');
    
    renderGameBoard();
    updateUserStats();
    saveGameState();
    hideItemDetail();
    animateItemVanish(itemIndex);
    
    setTimeout(() => { isProcessing = false; }, 300);
}

// ===== УВЕДОМЛЕНИЕ =====
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? 'rgba(255, 118, 117, 0.95)' : 'rgba(0, 184, 148, 0.95)'};
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        animation: slideIn 0.3s ease, slideOut 0.3s ease 2.7s;
        max-width: 300px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Анимация
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notification.remove();
        style.remove();
    }, 3000);
}

// ===== ПОКАЗАТЬ ИНФОРМАЦИЮ О ПРЕДМЕТЕ =====
function showItemDetail(itemIndex) {
    if (isDragging) return;
    
    const item = gameBoard[itemIndex];
    if (!item) return;
    
    selectedItemIndex = itemIndex;
    
    // Обновляем информацию в панели
    document.getElementById('itemDetailLevel').textContent = `Уровень: ${item.level}`;
    document.getElementById('sellXp').textContent = `${SELL_REWARDS.xp[item.level] || 0} XP`;
    document.getElementById('sellEnergy').textContent = `${SELL_REWARDS.energy[item.level] || 0}`;
    document.getElementById('combineXp').textContent = `${COMBINE_XP[item.level] || 0} XP`;
    
    // Создаем превью предмета с изображением
    const preview = document.getElementById('itemPreview');
    preview.innerHTML = '';
    
    const itemPreview = document.createElement('div');
    itemPreview.className = 'item';
    itemPreview.style.background = `linear-gradient(135deg, ${getLevelColor(item.level)}, ${getLevelColor(item.level)}80)`;
    itemPreview.style.width = '50px';
    itemPreview.style.height = '50px';
    itemPreview.style.borderRadius = '14px';
    itemPreview.style.position = 'relative';
    itemPreview.style.display = 'flex';
    itemPreview.style.alignItems = 'center';
    itemPreview.style.justifyContent = 'center';
    itemPreview.setAttribute('role', 'img');
    itemPreview.setAttribute('aria-label', `Предмет уровня ${item.level}`);
    
    // Уровень предмета
    const levelElement = document.createElement('div');
    levelElement.className = 'item-level-preview';
    levelElement.textContent = item.level;
    levelElement.style.position = 'absolute';
    levelElement.style.top = '4px';
    levelElement.style.right = '4px';
    levelElement.style.background = 'rgba(0, 0, 0, 0.6)';
    levelElement.style.color = 'white';
    levelElement.style.fontSize = '12px';
    levelElement.style.fontWeight = '700';
    levelElement.style.padding = '2px 6px';
    levelElement.style.borderRadius = '9999px';
    levelElement.style.minWidth = '18px';
    levelElement.style.textAlign = 'center';
    levelElement.style.backdropFilter = 'blur(10px)';
    levelElement.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    levelElement.style.zIndex = '2';
    
    // Иконка с изображением (во всю площадь)
    const iconElement = document.createElement('div');
    iconElement.className = 'item-icon-preview';
    iconElement.style.width = '100%';
    iconElement.style.height = '100%';
    iconElement.style.backgroundImage = `url('${getItemImageUrl(item)}')`;
    iconElement.style.backgroundSize = 'cover';
    iconElement.style.backgroundRepeat = 'no-repeat';
    iconElement.style.backgroundPosition = 'center';
    iconElement.style.borderRadius = '12px';
    iconElement.style.position = 'absolute';
    iconElement.style.top = '0';
    iconElement.style.left = '0';
    iconElement.style.zIndex = '1';
    
    itemPreview.appendChild(levelElement);
    itemPreview.appendChild(iconElement);
    preview.appendChild(itemPreview);
    
    // Устанавливаем focus для доступности
    const sellBtn = document.getElementById('sellBtn');
    setTimeout(() => sellBtn.focus(), 100);
    
    // Показываем панель
    const panel = document.getElementById('itemDetailPanel');
    panel.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
}

// ===== СКРЫТЬ ИНФОРМАЦИИ О ПРЕДМЕТЕ =====
function hideItemDetail() {
    selectedItemIndex = null;
    const panel = document.getElementById('itemDetailPanel');
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
}

// ===== ПОИСК ПУСТОЙ ЯЧЕЙКИ =====
function findEmptyCell() {
    for (let i = 0; i < gameBoard.length; i++) {
        if (gameBoard[i] === null) return i;
    }
    return -1;
}

// ===== ОБНОВЛЕНИЕ ИГРОВОГО ПОЛЯ =====
function renderGameBoard() {
    const boardElement = document.getElementById('gameBoard');
    if (!boardElement) return;
    
    boardElement.innerHTML = '';
    
    for (let i = 0; i < CONFIG.TOTAL_CELLS; i++) {
        const cellElement = createCellElement(i);
        boardElement.appendChild(cellElement);
    }
    
    // Обновляем ARIA
    const filledCells = gameBoard.filter(cell => cell !== null).length;
    boardElement.setAttribute('aria-label', `Игровое поле 4 на 4. Заполнено ${filledCells} из 16 ячеек`);
}

// ===== СОЗДАНИЕ ЭЛЕМЕНТА ЯЧЕЙКИ =====
function createCellElement(index) {
    const cell = gameBoard[index];
    const cellElement = document.createElement('div');
    
    cellElement.className = 'cell' + (cell ? '' : ' empty');
    cellElement.dataset.index = index;
    cellElement.setAttribute('role', 'gridcell');
    cellElement.setAttribute('aria-label', cell ? `Ячейка ${index + 1} с предметом уровня ${cell.level}` : `Пустая ячейка ${index + 1}`);
    cellElement.tabIndex = -1;
    
    addDragEventsToCell(cellElement, index);
    
    if (cell) {
        const itemElement = createItemElement(cell, index);
        cellElement.appendChild(itemElement);
    }
    
    return cellElement;
}

// ===== СОЗДАНИЕ ЭЛЕМЕНТА ПРЕДМЕТА =====
function createItemElement(item, cellIndex) {
    const itemElement = document.createElement('div');
    
    itemElement.className = 'item';
    itemElement.draggable = true;
    itemElement.dataset.itemId = item.id;
    itemElement.dataset.cellIndex = cellIndex;
    itemElement.setAttribute('role', 'button');
    itemElement.setAttribute('aria-label', `Предмет уровня ${item.level}. Нажмите для информации, перетащите для скрещивания`);
    itemElement.tabIndex = 0;
    
    // Градиентный фон
    itemElement.style.background = `linear-gradient(135deg, ${getLevelColor(item.level)}, ${getLevelColor(item.level)}80)`;
    itemElement.style.borderRadius = 'var(--radius-medium)';
    itemElement.style.position = 'relative';
    itemElement.style.overflow = 'hidden';
    
    // Уровень предмета (поверх изображения)
    const levelElement = document.createElement('div');
    levelElement.className = 'item-level';
    levelElement.textContent = item.level;
    levelElement.style.position = 'absolute';
    levelElement.style.top = '6px';
    levelElement.style.right = '6px';
    levelElement.style.background = 'rgba(0, 0, 0, 0.6)';
    levelElement.style.color = 'white';
    levelElement.style.fontSize = '14px';
    levelElement.style.fontWeight = '700';
    levelElement.style.padding = '4px 8px';
    levelElement.style.borderRadius = '9999px';
    levelElement.style.minWidth = '24px';
    levelElement.style.textAlign = 'center';
    levelElement.style.backdropFilter = 'blur(10px)';
    levelElement.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    levelElement.style.zIndex = '3'; // Поверх изображения
    levelElement.setAttribute('aria-hidden', 'true');
    
    // Иконка с изображением (во всю площадь)
    const iconElement = document.createElement('div');
    iconElement.className = 'item-icon-full';
    iconElement.style.width = '100%';
    iconElement.style.height = '100%';
    iconElement.style.backgroundImage = `url('${getItemImageUrl(item)}')`;
    iconElement.style.backgroundSize = 'cover';
    iconElement.style.backgroundRepeat = 'no-repeat';
    iconElement.style.backgroundPosition = 'center';
    iconElement.style.position = 'absolute';
    iconElement.style.top = '0';
    iconElement.style.left = '0';
    iconElement.style.zIndex = '2'; // Под уровнем
    
    // Прелоадер для изображения
    iconElement.style.backgroundImage = `url('${LOADING_IMAGE}'), ${iconElement.style.backgroundImage}`;
    
    itemElement.appendChild(levelElement);
    itemElement.appendChild(iconElement);
    
    // Добавляем события
    addDragEventsToItem(itemElement, cellIndex);
    
    if (isMobile) {
        addTouchEventsToItem(itemElement, cellIndex);
    } else {
        itemElement.addEventListener('click', (e) => {
            e.stopPropagation();
            showItemDetail(cellIndex);
        });
        
        // Keyboard support
        itemElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showItemDetail(cellIndex);
            }
        });
    }
    
    return itemElement;
}

// ===== СОБЫТИЯ ПЕРЕТАСКИВАНИЯ =====
function addDragEventsToCell(cellElement, index) {
    cellElement.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (dragSourceIndex !== null && dragSourceIndex !== index && !isProcessing) {
            cellElement.classList.add('drag-over');
        }
    });
    
    cellElement.addEventListener('dragleave', () => {
        cellElement.classList.remove('drag-over');
    });
    
    cellElement.addEventListener('drop', (event) => {
        event.preventDefault();
        cellElement.classList.remove('drag-over');
        
        if (dragSourceIndex !== null && dragSourceIndex !== index && !isProcessing) {
            handleItemDrop(dragSourceIndex, index);
        }
    });
}

function addDragEventsToItem(itemElement, cellIndex) {
    itemElement.addEventListener('dragstart', (event) => {
        if (isProcessing) {
            event.preventDefault();
            return;
        }
        
        dragSourceIndex = cellIndex;
        isDragging = true;
        
        // Создаем драг-элемент
        createDragElement(itemElement, event);
        
        // Делаем оригинал полупрозрачным
        itemElement.style.opacity = '0.4';
        
        // Устанавливаем данные для передачи
        event.dataTransfer.setData('text/plain', cellIndex.toString());
        event.dataTransfer.effectAllowed = 'move';
        
        // Устанавливаем пустое изображение для драга
        const dragImage = new Image();
        dragImage.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
        event.dataTransfer.setDragImage(dragImage, 0, 0);
    });
    
    itemElement.addEventListener('dragend', () => {
        isDragging = false;
        dragSourceIndex = null;
        
        // Восстанавливаем оригинал
        itemElement.style.opacity = '1';
        
        // Удаляем драг-элемент
        if (dragElement) {
            dragElement.remove();
            dragElement = null;
        }
        
        // Убираем подсветку со всех ячеек
        document.querySelectorAll('.cell.drag-over').forEach(cell => {
            cell.classList.remove('drag-over');
        });
    });
}

// ===== TOUCH СОБЫТИЯ =====
function addTouchEventsToItem(itemElement, cellIndex) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouchDragging = false;
    
    itemElement.addEventListener('touchstart', (event) => {
        if (isProcessing) {
            event.preventDefault();
            return;
        }
        
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        isTouchDragging = false;
        event.preventDefault();
    }, { passive: false });
    
    itemElement.addEventListener('touchmove', (event) => {
        if (isProcessing) {
            event.preventDefault();
            return;
        }
        
        const touch = event.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        if (!isTouchDragging && (deltaX > 10 || deltaY > 10)) {
            startTouchDrag(itemElement, cellIndex, touch);
            isTouchDragging = true;
            isDragging = true;
        }
        
        if (isTouchDragging && dragElement) {
            dragElement.style.left = (touch.clientX - dragOffsetX) + 'px';
            dragElement.style.top = (touch.clientY - dragOffsetY) + 'px';
            updateTouchDragOver(touch.clientX, touch.clientY);
        }
        
        event.preventDefault();
    }, { passive: false });
    
    itemElement.addEventListener('touchend', (event) => {
        if (isTouchDragging) {
            const touch = event.changedTouches[0];
            handleTouchDrop(touch.clientX, touch.clientY);
            isTouchDragging = false;
            isDragging = false;
        } else {
            // Если был короткий тап (менее 500ms) - показываем детали
            const touchTime = Date.now() - touchStartTime;
            if (touchTime < 500) {
                showItemDetail(cellIndex);
            }
        }
        event.preventDefault();
    }, { passive: false });
    
    itemElement.addEventListener('touchcancel', () => {
        isTouchDragging = false;
        isDragging = false;
        itemElement.style.opacity = '1';
        if (dragElement) {
            dragElement.remove();
            dragElement = null;
        }
        document.querySelectorAll('.cell.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    }, { passive: false });
}

// ===== ОБРАБОТКА ПЕРЕТАСКИВАНИЯ БЕЗ ТЕНИ =====
function createDragElement(originalElement, event) {
    dragElement = originalElement.cloneNode(true);
    dragElement.className = 'dragging-element';
    
    // Устанавливаем стили
    dragElement.style.position = 'fixed';
    dragElement.style.pointerEvents = 'none';
    dragElement.style.zIndex = '9999';
    dragElement.style.opacity = '0.7';
    dragElement.style.transform = 'translate(-50%, -50%)';
    dragElement.style.transition = 'none';
    dragElement.style.width = originalElement.offsetWidth + 'px';
    dragElement.style.height = originalElement.offsetHeight + 'px';
    dragElement.style.left = event.clientX + 'px';
    dragElement.style.top = event.clientY + 'px';
    dragElement.style.boxShadow = '0 5px 25px rgba(0, 0, 0, 0.4)';
    dragElement.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    
    // Убираем все обработчики и атрибуты
    dragElement.removeAttribute('draggable');
    dragElement.removeAttribute('tabindex');
    dragElement.removeAttribute('role');
    dragElement.removeAttribute('aria-label');
    
    // Убираем внутренние элементы чтобы не мешали
    const levelElement = dragElement.querySelector('.item-level');
    const iconElement = dragElement.querySelector('.item-icon-full');
    if (levelElement) levelElement.style.display = 'none';
    if (iconElement) iconElement.style.display = 'none';
    
    document.body.appendChild(dragElement);
    
    // Добавляем глобальный обработчик
    document.addEventListener('dragover', function updatePosition(e) {
        if (!dragElement) return;
        dragElement.style.left = e.clientX + 'px';
        dragElement.style.top = e.clientY + 'px';
        e.preventDefault();
    });
}

function updateDragElementPosition(event) {
    if (!dragElement || !event.clientX || !event.clientY) return;
    
    // Обновляем позицию драг-элемента
    dragElement.style.left = event.clientX + 'px';
    dragElement.style.top = event.clientY + 'px';
    
    // Обновляем подсветку ячеек
    updateCellDragOver(event.clientX, event.clientY);
}

function updateCellDragOver(x, y) {
    document.querySelectorAll('.cell').forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && 
                      y >= rect.top && y <= rect.bottom;
        
        if (isOver) {
            const cellIndex = parseInt(cell.dataset.index);
            if (cellIndex !== dragSourceIndex) {
                cell.classList.add('drag-over');
            }
        } else {
            cell.classList.remove('drag-over');
        }
    });
}

function startTouchDrag(itemElement, cellIndex, touch) {
    dragSourceIndex = cellIndex;
    dragElement = itemElement.cloneNode(true);
    dragElement.classList.add('dragging-element');
    
    // Аналогичные стили как для мыши
    dragElement.style.position = 'fixed';
    dragElement.style.pointerEvents = 'none';
    dragElement.style.zIndex = '9999';
    dragElement.style.opacity = '0.8';
    dragElement.style.transform = 'translate(-50%, -50%)';
    
    const rect = itemElement.getBoundingClientRect();
    dragElement.style.width = rect.width + 'px';
    dragElement.style.height = rect.height + 'px';
    
    // Позиционируем по центру касания
    dragElement.style.left = touch.clientX + 'px';
    dragElement.style.top = touch.clientY + 'px';
    
    // Скрываем внутренние элементы
    const levelElement = dragElement.querySelector('.item-level');
    const iconElement = dragElement.querySelector('.item-icon-full');
    if (levelElement) levelElement.style.display = 'none';
    if (iconElement) iconElement.style.display = 'none';
    
    itemElement.style.opacity = '0.4';
    document.body.appendChild(dragElement);
}

function updateTouchDragOver(x, y) {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && 
                      y >= rect.top && y <= rect.bottom;
        
        if (isOver) {
            const cellIndex = parseInt(cell.dataset.index);
            if (cellIndex !== dragSourceIndex) {
                cell.classList.add('drag-over');
                cell.setAttribute('aria-dropeffect', 'move');
            }
        } else {
            cell.classList.remove('drag-over');
            cell.removeAttribute('aria-dropeffect');
        }
    });
}

function handleTouchDrop(x, y) {
    const cells = document.querySelectorAll('.cell');
    let targetCellIndex = null;
    
    cells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && 
            y >= rect.top && y <= rect.bottom) {
            const cellIndex = parseInt(cell.dataset.index);
            if (cellIndex !== dragSourceIndex) {
                targetCellIndex = cellIndex;
            }
        }
    });
    
    if (dragSourceIndex !== null && targetCellIndex !== null && !isProcessing) {
        handleItemDrop(dragSourceIndex, targetCellIndex);
    }
    
    const originalItem = document.querySelector(`.item[data-cell-index="${dragSourceIndex}"]`);
    if (originalItem) {
        originalItem.style.opacity = '1';
        originalItem.setAttribute('aria-grabbed', 'false');
    }
    
    if (dragElement) {
        dragElement.remove();
        dragElement = null;
    }
    
    document.querySelectorAll('.cell.drag-over').forEach(el => {
        el.classList.remove('drag-over');
        el.removeAttribute('aria-dropeffect');
    });
    
    dragSourceIndex = null;
}

// ===== ИСПРАВЛЕННАЯ ЛОГИКА СКРЕЩИВАНИЯ =====
function handleItemDrop(fromIndex, toIndex) {
    if (isProcessing) return;
    isProcessing = true;
    
    const fromItem = gameBoard[fromIndex];
    const toItem = gameBoard[toIndex];
    
    if (!fromItem) {
        isProcessing = false;
        return;
    }
    
    if (toItem === null) {
        // Просто перемещаем предмет - легкая вибрация
        vibrate(50);
        gameBoard[toIndex] = fromItem;
        gameBoard[fromIndex] = null;
    } else if (fromItem.level === toItem.level) {
        const newLevel = fromItem.level + 1;
        if (newLevel <= CONFIG.MAX_ITEM_LEVEL) {
            // Успешное скрещивание - средняя вибрация
            vibrate(100);
            
            const xpGained = COMBINE_XP[fromItem.level] || 0;
            addXP(xpGained);
            
            gameBoard[toIndex] = {
                id: Date.now() + Math.random(),
                level: newLevel,
                createdAt: Date.now()
            };
            gameBoard[fromIndex] = null;
            showNotification(`Создан предмет уровня ${newLevel}!`, 'success');
        } else {
            // Достигнут максимальный уровень - сильная вибрация
            vibrate(200);
            [gameBoard[fromIndex], gameBoard[toIndex]] = [toItem, fromItem];
        }
    } else {
        // Разные уровни - легкая вибрация
        vibrate(50);
        [gameBoard[fromIndex], gameBoard[toIndex]] = [toItem, fromItem];
    }
    
    setTimeout(() => {
        renderGameBoard();
        saveGameState();
        isProcessing = false;
    }, 100);
}

// ===== ОСНОВНЫЕ ФУНКЦИИ =====
function animateItemCombine(cellIndex) {
    setTimeout(() => {
        const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
        if (cell) {
            const item = cell.querySelector('.item');
            if (item) {
                item.classList.add('item-combine');
                setTimeout(() => item.classList.remove('item-combine'), 400);
            }
        }
    }, 10);
}

function animateItemVanish(cellIndex) {
    setTimeout(() => {
        const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
        if (cell) {
            const item = cell.querySelector('.item');
            if (item) {
                item.classList.add('item-vanish');
                setTimeout(() => item.classList.remove('item-vanish'), 500);
            }
        }
    }, 10);
}

function animateItemAppear(cellIndex) {
    setTimeout(() => {
        const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
        if (cell) {
            const item = cell.querySelector('.item');
            if (item) {
                item.classList.add('item-appear');
                setTimeout(() => item.classList.remove('item-appear'), 600);
            }
        }
    }, 10);
}

// ===== СОХРАНЕНИЕ И ЗАГРУЗКА =====
function saveGameState() {
    try {
        const gameState = {
            board: gameBoard,
            userData: userData,
            timestamp: Date.now(),
            version: 'full_v3'
        };
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(gameState));
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка сохранения игры', 'error');
    }
}

function loadGameState() {
    try {
        const saved = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        if (!saved) return false;
        
        const data = JSON.parse(saved);
        
        // Проверяем версию и срок хранения (30 дней)
        const isOld = Date.now() - data.timestamp > 30 * 24 * 60 * 60 * 1000;
        
        if (isOld || data.version !== 'full_v3') {
            console.log('Сохранение устарело или несовместимо');
            return false;
        }
        
        gameBoard = data.board || [];
        userData = data.userData || {
            level: 1,
            xp: 0,
            energy: 50,
            lastEnergyUpdate: Date.now()
        };
        
        updateEnergy();
        return true;
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showNotification('Ошибка загрузки игры', 'error');
        return false;
    }
}

function initNewGame() {
    gameBoard = Array(CONFIG.TOTAL_CELLS).fill(null);
    userData = {
        level: 1,
        xp: 0,
        energy: 50,
        lastEnergyUpdate: Date.now()
    };
}

function resetGame() {
    if (confirm('Сбросить игру? Весь прогресс будет потерян.')) {
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        initNewGame();
        renderGameBoard();
        updateUserStats();
        showNotification('Игра сброшена', 'info');
    }
}

// ===== НАСТРОЙКА СОБЫТИЙ =====
function setupButtonEvents() {
    const createBtn = document.getElementById('createBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            if (!isProcessing) vibrate(20);
            createItem();
        });
        // Keyboard support
        createBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                createItem();
            }
        });
    }
    
    const sellBtn = document.getElementById('sellBtn');
    if (sellBtn) {
        sellBtn.addEventListener('click', () => {
            vibrate(20);
            if (selectedItemIndex !== null) sellItem(selectedItemIndex);
        });
        sellBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (selectedItemIndex !== null) sellItem(selectedItemIndex);
            }
        });
    }
    
    const closeBtn = document.getElementById('closeDetailBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideItemDetail);
        closeBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                vibrate(10);
                hideItemDetail();
            }
        });
    }
    
    // Кнопка сброса для веб-версии
    if (typeof Telegram === 'undefined' || !Telegram.WebApp) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'button-create-compact';
        resetBtn.textContent = 'Сбросить игру';
        resetBtn.style.marginTop = 'var(--spacing-md)';
        resetBtn.style.background = 'linear-gradient(135deg, rgba(255, 118, 117, 0.9), rgba(253, 121, 168, 0.9))';
        resetBtn.addEventListener('click', resetGame);
        
        const actionPanel = document.querySelector('.action-panel');
        if (actionPanel) actionPanel.appendChild(resetBtn);
    }
}

function setupTelegramResetButton() {
    if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.MainButton) {
        Telegram.WebApp.MainButton.setText('🔄 Сбросить').show();
        Telegram.WebApp.MainButton.onClick(resetGame);
    }
}

function setupAutoSave() {
    setInterval(() => {
        if (gameBoard.some(cell => cell !== null)) saveGameState();
    }, CONFIG.SAVE_INTERVAL);
    
    setInterval(updateEnergy, 60000);
}

// ===== ОБРАБОТКА PWA =====
function setupPWA() {
    // Сохранение при закрытии
    window.addEventListener('pagehide', saveGameState);
    
    // Предотвращение выхода без сохранения
    window.addEventListener('beforeunload', (event) => {
        saveGameState();
        if (energyTimerInterval) {
            clearInterval(energyTimerInterval);
            energyTimerInterval = null;
        }
    });
    
    // Восстановление при возобновлении
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateEnergy();
        }
    });
}

// ===== ИНИЦИАЛИЗАЦИЯ ИГРЫ =====
function initGame() {
    console.log('=== ИНИЦИАЛИЗАЦИЯ ИГРЫ ===');
    
    initTelegramApp();
    detectDevice();
    preloadImages();
    setupPWA();
    
    const loaded = loadGameState();
    if (!loaded) initNewGame();
    
    renderGameBoard();
    updateUserStats();
    setupButtonEvents();
    setupTelegramResetButton();
    setupAutoSave();
    setupTelegramProfileUpdates(); // <-- Добавить эту строку
    
    console.log('=== ИГРА ГОТОВА ===');
}

// ===== ЗАПУСК =====
document.addEventListener('DOMContentLoaded', initGame);

window.addEventListener('error', (event) => {
    console.error('Ошибка:', event.error);
    showNotification('Произошла ошибка в игре', 'error');
});
