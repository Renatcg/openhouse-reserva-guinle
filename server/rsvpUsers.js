// Cadastro de usuários com acesso ao admin do RSVP (login + permissão pra
// gerenciar convidados/convites). Substitui o antigo arquivo único
// data/rsvp-admin.json por uma lista de usuários — na primeira execução,
// migra automaticamente o usuário único existente pra essa lista, então
// ninguém perde acesso quando essa função entra no ar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'rsvp-users.json');
const LEGACY_ADMIN_FILE = path.join(DATA_DIR, 'rsvp-admin.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(USERS_FILE)) return;

  // Migração: se já existia um único admin do RSVP, ele vira o primeiro
  // usuário da lista — assim quem já tinha login continua acessando normal.
  let seed = [];
  if (fs.existsSync(LEGACY_ADMIN_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_ADMIN_FILE, 'utf-8'));
      if (legacy && legacy.email && legacy.passwordHash) {
        const now = new Date().toISOString();
        seed = [{
          id: crypto.randomUUID(),
          name: legacy.name || 'Administrador',
          email: legacy.email,
          role: legacy.role || 'Administrador',
          passwordHash: legacy.passwordHash,
          createdAt: now,
          updatedAt: now,
        }];
      }
    } catch (err) { /* arquivo legado corrompido — segue com lista vazia */ }
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(seed, null, 2) + '\n');
}

function loadAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
}

function saveAll(users) {
  ensureFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n');
}

function findById(id) {
  return loadAll().find(u => u.id === id) || null;
}

function findByEmail(email) {
  const needle = (email || '').trim().toLowerCase();
  return loadAll().find(u => u.email.toLowerCase() === needle) || null;
}

function verifyPassword(email, password) {
  const user = findByEmail(email);
  if (!user || !password) return null;
  return bcrypt.compareSync(password, user.passwordHash) ? user : null;
}

function create({ name, email, role, password }) {
  const users = loadAll();
  const emailTrim = (email || '').trim();
  if (!emailTrim) throw new Error('Informe o e-mail (ou usuário) de login.');
  if (!password || password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (users.some(u => u.email.toLowerCase() === emailTrim.toLowerCase())) {
    throw new Error('Já existe um usuário com esse e-mail.');
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    name: (name || '').trim() || emailTrim,
    email: emailTrim,
    role: (role || '').trim() || 'Administrador RSVP',
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  saveAll(users);
  return user;
}

// password vazio/undefined no patch = mantém a senha atual.
function update(id, patch) {
  const users = loadAll();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;

  const user = users[idx];
  const emailTrim = patch.email !== undefined ? (patch.email || '').trim() : user.email;
  if (!emailTrim) throw new Error('Informe o e-mail (ou usuário) de login.');
  if (users.some(u => u.id !== id && u.email.toLowerCase() === emailTrim.toLowerCase())) {
    throw new Error('Já existe um usuário com esse e-mail.');
  }
  if (patch.password && patch.password.length < 6) {
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  }

  const updated = {
    ...user,
    name: patch.name !== undefined ? ((patch.name || '').trim() || emailTrim) : user.name,
    email: emailTrim,
    role: patch.role !== undefined ? ((patch.role || '').trim() || 'Administrador RSVP') : user.role,
    passwordHash: patch.password ? bcrypt.hashSync(patch.password, 10) : user.passwordHash,
    updatedAt: new Date().toISOString(),
  };
  users[idx] = updated;
  saveAll(users);
  return updated;
}

function remove(id) {
  const users = loadAll();
  const next = users.filter(u => u.id !== id);
  const removed = next.length !== users.length;
  if (removed) saveAll(next);
  return removed;
}

module.exports = {
  loadAll,
  findById,
  findByEmail,
  verifyPassword,
  create,
  update,
  remove,
};
