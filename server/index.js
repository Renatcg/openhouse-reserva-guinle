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
  createAuthModule,
} = require('./auth');
const products = require('./products');
const categories = require('./categories');
const rsvp = require('./rsvp');
const invites = require('./invites');
const whatsapp = require('./whatsapp');
const emailClient = require('./email');

// Ambiente de autenticação do RSVP: usuário/senha e sessão totalmente
// separados do admin do catálogo (cookie próprio "rsvp_admin_session").
const rsvpAuth = createAuthModule('rsvp_admin_session', '/admin/rsvp-login.html');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const RSVP_ADMIN_FILE = path.join(DATA_DIR, 'rsvp-admin.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'products');
const INVITE_UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads', 'invites');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(INVITE_UPLOADS_DIR)) fs.mkdirSync(INVITE_UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: '8mb' })); // e-mail rico (HTML com imagens embutidas) pode ser grande
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

// ---------- Upload da imagem do convite (uma por dia, por canal) ----------
const uploadInvite = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, INVITE_UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
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

function loadRsvpAdmin() {
  if (!fs.existsSync(RSVP_ADMIN_FILE)) return null;
  return JSON.parse(fs.readFileSync(RSVP_ADMIN_FILE, 'utf-8'));
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

// ---------- Rotas de autenticação do RSVP (ambiente separado) ----------
app.post('/api/rsvp/login', (req, res) => {
  const { email, password, remember } = req.body || {};
  const admin = loadRsvpAdmin();

  if (!admin) {
    return res.status(500).json({ error: 'Nenhum usuário administrador do RSVP cadastrado. Rode "npm run seed:rsvp-admin".' });
  }

  const emailOk = (email || '').trim().toLowerCase() === admin.email.toLowerCase();
  const passOk = password && bcrypt.compareSync(password, admin.passwordHash);

  if (!emailOk || !passOk) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }

  const token = rsvpAuth.signToken({ sub: admin.email, name: admin.name, role: admin.role }, !!remember);
  rsvpAuth.setSessionCookie(res, token, !!remember);

  res.json({ ok: true, user: { name: admin.name, role: admin.role, email: admin.email } });
});

app.post('/api/rsvp/logout', (req, res) => {
  rsvpAuth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/rsvp/me', rsvpAuth.requireAuthApi, (req, res) => {
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

  const { phone, name, email, companion, referral } = req.body || {};

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
  if (referral && referral.name && referral.name.trim() && (!referral.phone || !referral.phone.trim())) {
    return res.status(400).json({ error: 'Informe o telefone da pessoa indicada.' });
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
    referral: referral ? {
      name: (referral.name || '').trim(),
      phone: (referral.phone || '').trim(),
    } : null,
  });

  res.json({
    day: rsvp.DAYS[updated.day],
    status: updated.status,
    name: updated.confirmation.name,
    companionName: updated.confirmation.companion ? updated.confirmation.companion.name : null,
  });
});

// Indicação de amigo — preenchida na tela de sucesso, depois da confirmação.
app.post('/api/rsvp/:token/indicar', (req, res) => {
  const guest = rsvp.findByToken(req.params.token);
  if (!guest) return res.status(404).json({ error: 'Convite não encontrado.' });
  if (guest.status !== 'Confirmado') {
    return res.status(400).json({ error: 'Confirme sua presença antes de indicar alguém.' });
  }

  const { name, phone } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome da pessoa indicada.' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Informe o telefone da pessoa indicada.' });

  const updated = rsvp.setReferral(req.params.token, { name: name.trim(), phone: phone.trim() });
  if (!updated) return res.status(404).json({ error: 'Convite não encontrado.' });

  res.json({ ok: true });
});

// ---------- Admin do RSVP (API) — exige sessão ----------

app.get('/api/admin/rsvp/guests', rsvpAuth.requireAuthApi, (req, res) => {
  const guests = rsvp.loadAll().map(g => ({
    ...g,
    dayInfo: rsvp.DAYS[g.day],
  }));
  res.json({ guests, days: rsvp.DAYS });
});

app.post('/api/admin/rsvp/guests', rsvpAuth.requireAuthApi, (req, res) => {
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

app.put('/api/admin/rsvp/guests/:id', rsvpAuth.requireAuthApi, (req, res) => {
  const existing = rsvp.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Convidado não encontrado.' });

  const { day, phone, label, contact } = req.body || {};
  if (day !== undefined && !rsvp.DAYS[day]) return res.status(400).json({ error: 'Dia inválido.' });
  if (phone !== undefined && rsvp.normalizePhone(phone).length < 8) {
    return res.status(400).json({ error: 'Telefone inválido (mínimo 8 dígitos).' });
  }

  let updated;
  try {
    updated = rsvp.update(req.params.id, { day, phone, label, contact });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ guest: { ...updated, dayInfo: rsvp.DAYS[updated.day] } });
});

app.delete('/api/admin/rsvp/guests/:id', rsvpAuth.requireAuthApi, (req, res) => {
  const ok = rsvp.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Convidado não encontrado.' });
  res.json({ ok: true });
});

// ---------- Convites (imagem + texto por dia) e disparo em massa ----------
// WhatsApp: exige Message Template pré-aprovado pela Meta — nunca texto livre
// pra iniciar conversa. E-mail: HTML rico via Resend. Os dois guardam o
// resultado por convidado (rsvp.recordInviteResult) pra nunca reenviar sem
// que o admin peça explicitamente.

function buildPublicOrigin(req) {
  const host = req.hostname || req.get('host');
  const proto = host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https';
  return `${proto}://${host}`;
}

function buildInviteLink(req, token) {
  const origin = buildPublicOrigin(req);
  return isRsvpHost(req) ? `${origin}/?t=${token}` : `${origin}/rsvp/index.html?t=${token}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/api/admin/rsvp/invites', rsvpAuth.requireAuthApi, (req, res) => {
  res.json({
    days: rsvp.DAYS,
    content: invites.loadAll(),
    channelsConfigured: { whatsapp: whatsapp.isConfigured(), email: emailClient.isConfigured() },
  });
});

app.put('/api/admin/rsvp/invites/:day', rsvpAuth.requireAuthApi, (req, res) => {
  if (!rsvp.DAYS[req.params.day]) return res.status(400).json({ error: 'Dia inválido.' });
  const updated = invites.updateDay(req.params.day, req.body || {});
  res.json({ content: updated });
});

app.post('/api/admin/rsvp/invites/:day/image', rsvpAuth.requireAuthApi, uploadInvite.single('image'), (req, res) => {
  if (!rsvp.DAYS[req.params.day]) return res.status(400).json({ error: 'Dia inválido.' });
  const channel = req.body && req.body.channel === 'email' ? 'email' : 'whatsapp';
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem.' });
  const relativePath = `/uploads/invites/${req.file.filename}`;
  const updated = invites.setImage(req.params.day, channel, relativePath);
  res.json({ content: updated });
});

// Dispara o convite por WhatsApp pra todos os convidados pendentes daquele
// dia (ou pros IDs informados). Sempre via template aprovado — nunca texto
// livre — e com uma pequena pausa entre envios pra não estourar os limites
// de disparo da conta.
app.post('/api/admin/rsvp/invites/:day/send-whatsapp', rsvpAuth.requireAuthApi, async (req, res) => {
  const day = req.params.day;
  if (!rsvp.DAYS[day]) return res.status(400).json({ error: 'Dia inválido.' });
  if (!req.body || req.body.confirmConsent !== true) {
    return res.status(400).json({ error: 'Confirme que tem consentimento pra contatar esses números antes de enviar.' });
  }

  const content = invites.getDay(day);
  if (!content.whatsappTemplateName) {
    return res.status(400).json({ error: 'Informe o nome do template do WhatsApp (aprovado na Meta) antes de enviar.' });
  }

  const { guestIds, onlyNotSent } = req.body;
  let targets = rsvp.loadAll().filter(g => g.day === day);
  if (Array.isArray(guestIds) && guestIds.length) {
    targets = targets.filter(g => guestIds.includes(g.id));
  } else if (onlyNotSent !== false) {
    targets = targets.filter(g => g.invites.whatsapp.status !== 'Enviado');
  }

  const headerImageLink = content.imageWhatsapp ? `${buildPublicOrigin(req)}${content.imageWhatsapp}` : null;
  const results = [];

  for (const guest of targets) {
    if (!guest.phone) {
      rsvp.recordInviteResult(guest.id, 'whatsapp', { ok: false, error: 'Sem telefone cadastrado.' });
      results.push({ id: guest.id, ok: false, error: 'Sem telefone cadastrado.' });
      continue;
    }
    const link = buildInviteLink(req, guest.token);
    const firstName = (guest.label || '').trim().split(' ')[0] || 'convidado(a)';
    try {
      await whatsapp.sendTemplateMessage({
        to: guest.phone,
        templateName: content.whatsappTemplateName,
        languageCode: content.whatsappLanguage,
        headerImageLink,
        bodyParams: [firstName, link],
      });
      rsvp.recordInviteResult(guest.id, 'whatsapp', { ok: true });
      results.push({ id: guest.id, ok: true });
    } catch (err) {
      rsvp.recordInviteResult(guest.id, 'whatsapp', { ok: false, error: err.message });
      results.push({ id: guest.id, ok: false, error: err.message });
    }
    await sleep(300); // ritmo de envio conservador — evita estourar limites de disparo
  }

  res.json({
    total: results.length,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
});

// Dispara o convite por e-mail (Resend) pra todos os convidados pendentes
// daquele dia (ou pros IDs informados).
app.post('/api/admin/rsvp/invites/:day/send-email', rsvpAuth.requireAuthApi, async (req, res) => {
  const day = req.params.day;
  if (!rsvp.DAYS[day]) return res.status(400).json({ error: 'Dia inválido.' });
  if (!req.body || req.body.confirmConsent !== true) {
    return res.status(400).json({ error: 'Confirme que tem consentimento pra contatar esses e-mails antes de enviar.' });
  }

  const content = invites.getDay(day);
  const { guestIds, onlyNotSent } = req.body;
  let targets = rsvp.loadAll().filter(g => g.day === day);
  if (Array.isArray(guestIds) && guestIds.length) {
    targets = targets.filter(g => guestIds.includes(g.id));
  } else if (onlyNotSent !== false) {
    targets = targets.filter(g => g.invites.email.status !== 'Enviado');
  }

  const results = [];
  for (const guest of targets) {
    const toEmail = (guest.confirmation && guest.confirmation.email) || (guest.contact && guest.contact.email);
    if (!toEmail) {
      rsvp.recordInviteResult(guest.id, 'email', { ok: false, error: 'Sem e-mail cadastrado.' });
      results.push({ id: guest.id, ok: false, error: 'Sem e-mail cadastrado.' });
      continue;
    }
    const link = buildInviteLink(req, guest.token);
    const name = guest.label || (guest.confirmation && guest.confirmation.name) || '';
    const dayInfo = rsvp.DAYS[day];
    let html = invites.fillEmailTokens(content.emailHtml, { name, link, dayLabel: dayInfo.label, dateLabel: dayInfo.dateLabel });
    if (content.imageEmail) {
      const imgUrl = `${buildPublicOrigin(req)}${content.imageEmail}`;
      html = `<img src="${imgUrl}" alt="" style="max-width:100%;display:block;margin-bottom:16px;" />` + html;
    }
    const subject = invites.fillEmailTokens(content.emailSubject, { name, link, dayLabel: dayInfo.label, dateLabel: dayInfo.dateLabel });

    try {
      await emailClient.sendEmail({ to: toEmail, subject, html });
      rsvp.recordInviteResult(guest.id, 'email', { ok: true });
      results.push({ id: guest.id, ok: true });
    } catch (err) {
      rsvp.recordInviteResult(guest.id, 'email', { ok: false, error: err.message });
      results.push({ id: guest.id, ok: false, error: err.message });
    }
    await sleep(150);
  }

  res.json({
    total: results.length,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
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
    unit: g.contact ? g.contact.unit : null,
    status: g.status,
    guest: g.confirmation ? { name: g.confirmation.name, email: g.confirmation.email, phone: g.confirmation.phone } : null,
    companion: g.confirmation && g.confirmation.companion ? g.confirmation.companion : null,
    referral: g.confirmation && g.confirmation.referral ? g.confirmation.referral : null,
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
  res.set('Cache-Control', 'no-store');
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(`/rsvp/index.html${qs}`);
});

app.get(['/admin', '/admin/'], (req, res, next) => {
  if (!isRsvpHost(req)) return next();
  res.set('Cache-Control', 'no-store');
  res.redirect('/admin/rsvp-convidados.html');
});

// ---------- Área protegida (páginas HTML do admin) ----------
// Protege /admin/*.html no servidor: sem sessão válida, redireciona pro login
// antes mesmo de servir o arquivo estático.
const noCacheForHtml = (res, filePath) => {
  if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-store');
};

// O admin do RSVP é um ambiente à parte (usuário/senha próprios, sessão
// própria via rsvpAuth) — por isso essas duas páginas são tratadas ANTES do
// mount genérico de /admin (que exige a sessão do catálogo) e nunca passam
// pelo requireAuthPage do catálogo.
app.get('/admin/rsvp-login.html', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'rsvp-login.html'));
});

app.get('/admin/rsvp-convidados.html', rsvpAuth.requireAuthPage, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'rsvp-convidados.html'));
});

app.get('/admin/rsvp-convites.html', rsvpAuth.requireAuthPage, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'rsvp-convites.html'));
});

app.use('/admin', requireAuthPage, express.static(path.join(PUBLIC_DIR, 'admin'), { setHeaders: noCacheForHtml }));

// ---------- Estáticos públicos (catálogo, login, RSVP) ----------
app.use(express.static(PUBLIC_DIR, { setHeaders: noCacheForHtml }));

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
