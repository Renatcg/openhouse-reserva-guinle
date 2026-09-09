require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuthApi,
  requireAuthPage,
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

app.use(express.json());
app.use(cookieParser());

// ---------- Helpers ----------
function loadAdmin() {
  if (!fs.existsSync(ADMIN_FILE)) return null;
  return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf-8'));
}

// ---------- Rotas de autenticação (API) ----------
app.post('/api/login', (req, res) => {
  const { email, password, remember } = req.body || {};
  const admin = loadAdmin();

  if (!admin) {
    return res.status(500).json({ error: 'Nenhum usuário administrador cadastrado. Rode "npm run seed:admin".' });
  }

  const emailOk = (email || '').trim().toLowerCase() === admin.email.toLowerCase();
  const passOk = password && bcrypt.compareSync(password, admin.passwordHash);

  if (!emailOk || !passOk) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }

  const token = signToken({ sub: admin.email, name: admin.name, role: admin.role }, !!remember);
  setSessionCookie(res, token, !!remember);

  res.json({ ok: true, user: { name: admin.name, role: admin.role, email: admin.email } });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuthApi, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Área protegida (páginas HTML do admin) ----------
// Protege /admin/*.html no servidor: sem sessão válida, redireciona pro login
// antes mesmo de servir o arquivo estático.
app.use('/admin', requireAuthPage, express.static(path.join(PUBLIC_DIR, 'admin')));

// ---------- Estáticos públicos (catálogo, login, RSVP) ----------
app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`\n  Open House Reserva Guinle rodando em http://localhost:${PORT}`);
  console.log(`  Catálogo: http://localhost:${PORT}/index.html`);
  console.log(`  Login admin: http://localhost:${PORT}/login.html\n`);
});
