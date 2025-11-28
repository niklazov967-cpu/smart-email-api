/**
 * Простая авторизация для защиты API от несанкционированного доступа
 * Использует сессии для хранения состояния авторизации
 */

const session = require('express-session');

class AuthMiddleware {
  constructor() {
    this.sessionMiddleware = session({
      secret: process.env.SESSION_SECRET || 'smart-email-api-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // В production установить true если используется HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
      }
    });
    
    // Учетные данные из переменных окружения
    this.username = process.env.AUTH_USERNAME || 'admin';
    this.password = process.env.AUTH_PASSWORD || 'admin123';
  }

  /**
   * Middleware для инициализации сессий
   */
  initSession() {
    return this.sessionMiddleware;
  }

  /**
   * Проверка авторизации
   */
  requireAuth(req, res, next) {
    // Проверить сессию
    if (req.session && req.session.isAuthenticated) {
      return next();
    }

    // Если это API запрос - вернуть JSON ошибку
    if (req.path.startsWith('/api')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Требуется авторизация'
      });
    }

    // Для HTML страниц - редирект на страницу логина
    res.redirect('/login.html');
  }

  /**
   * Обработка логина
   */
  async handleLogin(req, res) {
    const { username, password } = req.body;

    // Простая проверка логина/пароля
    if (username === this.username && password === this.password) {
      // Установить сессию
      req.session.isAuthenticated = true;
      req.session.username = username;

      return res.json({
        success: true,
        message: 'Успешная авторизация'
      });
    }

    // Неверный логин/пароль
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
      message: 'Неверный логин или пароль'
    });
  }

  /**
   * Обработка logout
   */
  handleLogout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Logout failed',
          message: 'Ошибка при выходе'
        });
      }

      res.json({
        success: true,
        message: 'Вы вышли из системы'
      });
    });
  }

  /**
   * Проверка статуса авторизации
   */
  checkAuth(req, res) {
    if (req.session && req.session.isAuthenticated) {
      return res.json({
        success: true,
        isAuthenticated: true,
        username: req.session.username
      });
    }

    res.json({
      success: true,
      isAuthenticated: false
    });
  }
}

module.exports = AuthMiddleware;

