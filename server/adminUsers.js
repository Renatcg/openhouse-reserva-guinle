// Cadastro de usuários com acesso ao admin do catálogo (login + permissão
// pra gerenciar produtos/categorias/orçamentos). Mesmo padrão de
// server/rsvpUsers.js — substitui o antigo arquivo único data/admin.json
// por uma lista de usuários; na primeira execução, migra automaticamente o
// usuário único existente pra essa lista, então ninguém perde acesso quando
// essa função entra no ar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'admin-users.json');
const LEGACY_ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(USERS_FILE)) return;

  // Migração: se já existia um único admin do catálogo, ele vira o primeiro
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
    role: (role || '').trim() || 'Administrador',
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  saveAll(users);
  return user;
}

module.exports = {
  loadAll,
  findById,
  findByEmail,
  verifyPassword,
  create,
};
