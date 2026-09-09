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
