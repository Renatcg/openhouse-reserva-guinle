require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuthApi,
  requireAuthPage,
} = require('./auth');
const products = require('./products');
const categories = require('./categories');
const rsvp = require('./rsvp');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'products');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(cookieParser());

// ---------- Upload de imagens de produto ----------
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Formato de imagem não suportado (use PNG, JPG ou WEBP).'));
    cb(null, true);
  },
});

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

// ---------- Rotas de produtos (API) ----------
// Leitura é pública (o catálogo do evento não exige login).
// Escrita (criar/editar/excluir) exige sessão de admin válida.

app.get('/api/products', (req, res) => {
  res.json({ products: products.loadAll() });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ product });
});

app.post('/api/products', requireAuthApi, upload.array('images', 8), (req, res) => {
  const { title, description, category, room, status, existingImages } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'Título é obrigatório.' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'Descrição é obrigatória.' });
  if (!category || !category.trim()) return res.status(400).json({ error: 'Categoria é obrigatória.' });

  const uploaded = (req.files || []).map(f => `/uploads/products/${f.filename}`);
  const kept = existingImages ? JSON.parse(existingImages) : [];

  const product = products.create({
    title: title.trim(),
    description: description.trim(),
    category: category.trim(),
    room: (room || '').trim(),
    status,
    images: [...kept, ...uploaded],
  });

  res.status(201).json({ product });
});

app.put('/api/products/:id', requireAuthApi, upload.array('images', 8), (req, res) => {
  const existing = products.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

  const { title, description, category, room, status, existingImages } = req.body;
  const uploaded = (req.files || []).map(f => `/uploads/products/${f.filename}`);
  const kept = existingImages !== undefined ? JSON.parse(existingImages) : existing.images;

  const product = products.update(req.params.id, {
    title: title !== undefined ? title.trim() : undefined,
    description: description !== undefined ? description.trim() : undefined,
    category: category !== undefined ? category.trim() : undefined,
    room: room !== undefined ? room.trim() : undefined,
    status,
    images: [...kept, ...uploaded],
  });

  res.json({ product });
});

app.delete('/api/products/:id', requireAuthApi, (req, res) => {
  const ok = products.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ ok: true });
});

// ---------- Rotas de categorias (API) ----------
// Leitura é pública (usada no catálogo e no formulário de produto).
// Criar/editar título exige sessão de admin válida. Sem exclusão por ora.

app.get('/api/categories', (req, res) => {
  res.json({ categories: categories.loadAll() });
});

app.post('/api/categories', requireAuthApi, (req, res) => {
  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

  const exists = categories.loadAll().some(c => c.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });

  const category = categories.create({ title: title.trim() });
  res.status(201).json({ category });
});

app.put('/api/categories/:id', requireAuthApi, (req, res) => {
  const existing = categories.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Categoria não encontrada.' });

  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

  const duplicate = categories.loadAll().some(c => c.id !== req.params.id && c.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (duplicate) return res.status(409).json({ error: 'Já existe uma categoria com esse nome.' });

  const category = categories.update(req.params.id, { title: title.trim() });
  res.json({ category });
});

// ---------- Rotas do RSVP (API) ----------
// O convite de cada pessoa é identificado por um token único na URL.
// GET é público (é o que a página do convidado usa), mas nunca devolve o
// telefone cadastrado — só o dia do evento e, se já confirmado, o nome.

app.get('/api/rsvp/:token', (req, res) => {
  const guest = rsvp.findByToken(req.params.token);
  if (!guest) return res.status(404).json({ error: 'Convite não encontrado.' });

  res.json({
    day: rsvp.DAYS[guest.day],
    status: guest.status,
    name: guest.confirmation ? guest.confirmation.name : null,
    companionName: guest.confirmation && guest.confirmation.companion ? guest.confirmation.companion.name : null,
  });
});

app.post('/api/rsvp/:token/verificar-telefone', (req, res) => {
  const guest = rsvp.findByToken(req.params.token);
  if (!guest) return res.status(404).json({ error: 'Convite não encontrado.' });

  const { phone } = req.body || {};
  const ok = rsvp.verifyPhone(req.params.token, phone || '');
  res.json({ ok });
});

app.post('/api/rsvp/:token/confirmar', (req, res) => {
  const guest = rsvp.findByToken(req.params.token);
  if (!guest) return res.status(404).json({ error: 'Convite não encontrado.' });

  const { phone, name, email, companion } = req.body || {};

  // O telefone é validado de novo no servidor — a checagem no navegador é só
  // conveniência de UX, quem garante de verdade é aqui.
  if (!rsvp.verifyPhone(req.params.token, phone || '')) {
    return res.status(403).json({ error: 'Telefone não confere com o convite.' });
  }
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome completo é obrigatório.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'E-mail é obrigatório.' });
  if (companion && companion.name && companion.name.trim() && (!companion.email || !companion.email.trim())) {
    return res.status(400).json({ error: 'Informe o e-mail do acompanhante.' });
  }

  const updated = rsvp.confirm(req.params.token, {
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    companion: companion ? {
      name: (companion.name || '').trim(),
      email: (companion.email || '').trim(),
      phone: (companion.phone || '').trim(),
    } : null,
  });

  res.json({
    day: rsvp.DAYS[updated.day],
    status: updated.status,
    name: updated.confirmation.name,
    companionName: updated.confirmation.companion ? updated.confirmation.companion.name : null,
  });
});

// ---------- Admin do RSVP (API) — exige sessão ----------

app.get('/api/admin/rsvp/guests', requireAuthApi, (req, res) => {
  const guests = rsvp.loadAll().map(g => ({
    ...g,
    dayInfo: rsvp.DAYS[g.day],
  }));
  res.json({ guests, days: rsvp.DAYS });
});

app.post('/api/admin/rsvp/guests', requireAuthApi, (req, res) => {
  const { day, entries } = req.body || {};
  if (!rsvp.DAYS[day]) return res.status(400).json({ error: 'Dia inválido.' });
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Informe pelo menos um telefone.' });
  }

  const cleaned = entries
    .map(e => (typeof e === 'string' ? { phone: e } : e))
    .filter(e => e.phone && rsvp.normalizePhone(e.phone).length >= 8);

  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Nenhum telefone válido encontrado (mínimo 8 dígitos).' });
  }

  const created = rsvp.createMany(day, cleaned);
  res.status(201).json({ guests: created });
});

app.delete('/api/admin/rsvp/guests/:id', requireAuthApi, (req, res) => {
  const ok = rsvp.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Convidado não encontrado.' });
  res.json({ ok: true });
});

// ---------- Webhook do RSVP (para o pipeline da Mauad consultar a lista) ----------
// Autenticado por chave estática, não por sessão de admin — é um sistema externo
// consultando, não um navegador logado. Chave em RSVP_WEBHOOK_KEY (.env).

function requireWebhookKey(req, res, next) {
  const expected = process.env.RSVP_WEBHOOK_KEY;
  if (!expected) return res.status(500).json({ error: 'RSVP_WEBHOOK_KEY não configurada no servidor.' });

  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const provided = bearer || req.get('x-api-key') || req.query.key;

  if (provided !== expected) return res.status(401).json({ error: 'Chave de acesso inválida.' });
  next();
}

app.get('/api/webhook/rsvp', requireWebhookKey, (req, res) => {
  const guests = rsvp.loadAll();
  const list = guests.map(g => ({
    id: g.id,
    day: g.day,
    dayLabel: rsvp.DAYS[g.day] ? rsvp.DAYS[g.day].label : g.day,
    dateLabel: rsvp.DAYS[g.day] ? rsvp.DAYS[g.day].dateLabel : null,
    phone: g.phone,
    label: g.label,
    status: g.status,
    guest: g.confirmation ? { name: g.confirmation.name, email: g.confirmation.email, phone: g.confirmation.phone } : null,
    companion: g.confirmation && g.confirmation.companion ? g.confirmation.companion : null,
    confirmedAt: g.confirmation ? g.confirmation.confirmedAt : null,
  }));

  res.json({
    generatedAt: new Date().toISOString(),
    total: list.length,
    confirmed: list.filter(g => g.status === 'Confirmado').length,
    guests: list,
  });
});

// ---------- Roteamento por domínio (rsvp.qualifika.com.br) ----------
// Quando o app é acessado pelo domínio do RSVP, a raiz "/" deve cair na tela
// do convidado (rsvp/index.html) e "/admin" deve cair direto na área
// administrativa de convidados, em vez do catálogo.
const RSVP_HOSTS = (process.env.RSVP_HOST || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

function isRsvpHost(req) {
  if (!RSVP_HOSTS.length) return false;
  return RSVP_HOSTS.includes((req.hostname || '').toLowerCase());
}

// Pequeno endpoint público para o front-end saber se está sendo acessado
// pelo domínio do RSVP (usado para montar links curtos no admin de convidados).
app.get('/api/config', (req, res) => {
  res.json({ rsvpHost: isRsvpHost(req) });
});

app.get('/', (req, res, next) => {
  if (!isRsvpHost(req)) return next();
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(`/rsvp/index.html${qs}`);
});

app.get(['/admin', '/admin/'], (req, res, next) => {
  if (!isRsvpHost(req)) return next();
  res.redirect('/admin/rsvp-convidados.html');
});

// ---------- Área protegida (páginas HTML do admin) ----------
// Protege /admin/*.html no servidor: sem sessão válida, redireciona pro login
// antes mesmo de servir o arquivo estático.
app.use('/admin', requireAuthPage, express.static(path.join(PUBLIC_DIR, 'admin')));

// ---------- Estáticos públicos (catálogo, login, RSVP) ----------
app.use(express.static(PUBLIC_DIR));

// ---------- Erros de upload (multer) em formato JSON ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || (err && err.message && err.message.includes('imagem'))) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`\n  Open House Reserva Guinle rodando em http://localhost:${PORT}`);
  console.log(`  Catálogo: http://localhost:${PORT}/index.html`);
  console.log(`  Login admin: http://localhost:${PORT}/login.html\n`);
});
