// Helpers de leitura/escrita do "banco" de convidados do RSVP (arquivo JSON simples).
// Cada convidado tem um token único (o link do convite) e um telefone cadastrado
// que precisa bater com o telefone informado na tela pra liberar o resto do formulário.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GUESTS_FILE = path.join(DATA_DIR, 'guests.json');

// Dias do evento. Mudar aqui reflete em toda a tela do convidado e no admin.
const DAYS = {
  dia1: { key: 'dia1', short: 'Dia 1', label: 'Sexta, 9 de outubro', weekday: 'Sexta-feira', dateLabel: '9 de outubro de 2026', time: '15h' },
  dia2: { key: 'dia2', short: 'Dia 2', label: 'Sábado, 10 de outubro', weekday: 'Sábado', dateLabel: '10 de outubro de 2026', time: '15h' },
  dia3: { key: 'dia3', short: 'Dia 3', label: 'Domingo, 11 de outubro', weekday: 'Domingo', dateLabel: '11 de outubro de 2026', time: '15h' },
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(GUESTS_FILE)) fs.writeFileSync(GUESTS_FILE, '[]\n');
}

const DEFAULT_INVITES = () => ({
  whatsapp: { status: 'Não enviado', sentAt: null, error: null },
  email: { status: 'Não enviado', sentAt: null, error: null },
});

function loadAll() {
  ensureFile();
  const guests = JSON.parse(fs.readFileSync(GUESTS_FILE, 'utf-8'));
  // Convidados criados antes do rastreio de convites ganham o valor padrão.
  return guests.map(g => (g.invites ? g : { ...g, invites: DEFAULT_INVITES() }));
}

function saveAll(guests) {
  ensureFile();
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2) + '\n');
}

// Só dígitos, pra comparar telefones sem depender de máscara/espaços/traços/DDI.
function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

function findById(id) {
  return loadAll().find(g => g.id === id) || null;
}

function findByToken(token) {
  return loadAll().find(g => g.token === token) || null;
}

function generateToken() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars, seguro pra URL
}

function create({ day, phone, label, contact }) {
  if (!DAYS[day]) throw new Error(`Dia inválido: ${day}`);
  const guests = loadAll();
  const now = new Date().toISOString();
  let token = generateToken();
  while (guests.some(g => g.token === token)) token = generateToken(); // colisão é raríssima, mas por garantia

  const guest = {
    id: crypto.randomUUID(),
    token,
    day,
    phone: normalizePhone(phone),
    label: (label || '').trim(),
    // Dados de referência já conhecidos (ex: vindos da planilha de compradores) —
    // só pra identificação no admin/webhook. O convidado ainda preenche os dados
    // dele mesmo no formulário; isso não é usado pra pré-preencher nem pula a
    // validação de telefone.
    contact: contact ? {
      unit: contact.unit || '',
      email: contact.email || '',
      address: contact.address || '',
    } : null,
    status: 'Pendente',
    confirmation: null,
    // Rastreia se/quando o convite foi disparado em cada canal — evita
    // reenvio acidental (política de uso responsável de disparo em massa).
    invites: {
      whatsapp: { status: 'Não enviado', sentAt: null, error: null },
      email: { status: 'Não enviado', sentAt: null, error: null },
    },
    createdAt: now,
    updatedAt: now,
  };
  guests.push(guest);
  saveAll(guests);
  return guest;
}

function update(id, patch) {
  const guests = loadAll();
  const idx = guests.findIndex(g => g.id === id);
  if (idx === -1) return null;
  if (patch.day !== undefined && !DAYS[patch.day]) throw new Error(`Dia inválido: ${patch.day}`);

  const guest = guests[idx];
  const updated = {
    ...guest,
    day: patch.day !== undefined ? patch.day : guest.day,
    phone: patch.phone !== undefined ? normalizePhone(patch.phone) : guest.phone,
    label: patch.label !== undefined ? (patch.label || '').trim() : guest.label,
    contact: patch.contact !== undefined ? (patch.contact ? {
      unit: patch.contact.unit || '',
      email: patch.contact.email || '',
      address: patch.contact.address || '',
    } : null) : guest.contact,
    updatedAt: new Date().toISOString(),
  };
  guests[idx] = updated;
  saveAll(guests);
  return updated;
}

function createMany(day, entries) {
  return entries.map(entry => create({
    day,
    phone: typeof entry === 'string' ? entry : entry.phone,
    label: typeof entry === 'string' ? '' : entry.label,
    contact: typeof entry === 'string' ? null : entry.contact,
  }));
}

function verifyPhone(token, phone) {
  const guest = findByToken(token);
  if (!guest) return false;
  return guest.phone.length > 0 && guest.phone === normalizePhone(phone);
}

function confirm(token, data) {
  const guests = loadAll();
  const idx = guests.findIndex(g => g.token === token);
  if (idx === -1) return null;

  const guest = guests[idx];
  const now = new Date().toISOString();
  const updated = {
    ...guest,
    status: 'Confirmado',
    confirmation: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      companion: data.companion && data.companion.name
        ? { name: data.companion.name, email: data.companion.email || '', phone: data.companion.phone || '' }
        : null,
      referral: data.referral && data.referral.name
        ? { name: data.referral.name, phone: data.referral.phone || '' }
        : null,
      confirmedAt: now,
    },
    updatedAt: now,
  };
  guests[idx] = updated;
  saveAll(guests);
  return updated;
}

function remove(id) {
  const guests = loadAll();
  const next = guests.filter(g => g.id !== id);
  const removed = next.length !== guests.length;
  if (removed) saveAll(next);
  return removed;
}

// Registra o resultado de um disparo (WhatsApp ou e-mail) pra este convidado.
// channel: 'whatsapp' | 'email'. result: { ok: boolean, error?: string }.
function recordInviteResult(id, channel, result) {
  const guests = loadAll();
  const idx = guests.findIndex(g => g.id === id);
  if (idx === -1) return null;

  const guest = guests[idx];
  const invites = guest.invites || DEFAULT_INVITES();
  invites[channel] = {
    status: result.ok ? 'Enviado' : 'Falhou',
    sentAt: result.ok ? new Date().toISOString() : invites[channel].sentAt,
    error: result.ok ? null : (result.error || 'Erro desconhecido'),
  };
  guests[idx] = { ...guest, invites, updatedAt: new Date().toISOString() };
  saveAll(guests);
  return guests[idx];
}

module.exports = {
  DAYS,
  loadAll,
  findById,
  findByToken,
  create,
  createMany,
  update,
  verifyPhone,
  confirm,
  remove,
  recordInviteResult,
  normalizePhone,
};
