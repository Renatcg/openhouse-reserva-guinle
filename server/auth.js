// Middlewares e helpers de autenticação JWT.
// O token fica em cookie httpOnly (não acessível via JS no navegador),
// assinado com JWT_SECRET. Isso evita XSS roubando o token via localStorage.
//
// createAuthModule() gera um conjunto independente de helpers (cookie próprio,
// redirecionamento de login próprio) — usado para ter dois "ambientes" de
// login totalmente separados: o admin do catálogo e o admin do RSVP, cada um
// com seu próprio usuário/senha e sua própria sessão.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Copie .env.example para .env e configure um segredo.');
}

const EXPIRES_SHORT = '8h';   // sessão normal
const EXPIRES_LONG = '30d';   // "manter conectado"

function createAuthModule(cookieName, loginRedirectPath) {
  function signToken(payload, remember) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: remember ? EXPIRES_LONG : EXPIRES_SHORT });
  }

  function setSessionCookie(res, token, remember) {
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000, // 30d ou 8h
    });
  }

  function clearSessionCookie(res) {
    res.clearCookie(cookieName);
  }

  function verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }

  // Middleware: exige sessão válida, senão responde 401 (uso em rotas de API)
  function requireAuthApi(req, res, next) {
    const token = req.cookies[cookieName];
    const user = token && verifyToken(token);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    req.user = user;
    next();
  }

  // Middleware: exige sessão válida, senão redireciona pro login (uso em páginas HTML)
  function requireAuthPage(req, res, next) {
    const token = req.cookies[cookieName];
    const user = token && verifyToken(token);
    if (!user) return res.redirect(loginRedirectPath);
    req.user = user;
    next();
  }

  return {
    COOKIE_NAME: cookieName,
    signToken,
    setSessionCookie,
    clearSessionCookie,
    verifyToken,
    requireAuthApi,
    requireAuthPage,
  };
}

// Ambiente do catálogo (admin de produtos/categorias) — comportamento original.
const catalogAuth = createAuthModule('og_session', '/login.html');

module.exports = {
  createAuthModule,
  ...catalogAuth,
};
