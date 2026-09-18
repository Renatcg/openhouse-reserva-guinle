// Helpers de leitura/escrita das solicitações de orçamento (arquivo JSON simples).
// Mesmo padrão de server/products.js — vive em data/, que já é o volume
// persistente configurado no EasyPanel (não precisa criar volume novo).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QUOTES_FILE)) fs.writeFileSync(QUOTES_FILE, '[]\n');
}

function loadAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf-8'));
}

function saveAll(quotes) {
  ensureFile();
  fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotes, null, 2) + '\n');
}

function findById(id) {
  return loadAll().find(q => q.id === id) || null;
}

function create({ name, email, phone, productIds }) {
  const quotes = loadAll();
  const now = new Date().toISOString();
  const quote = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    productIds: Array.isArray(productIds) ? productIds : [],
    createdAt: now,
  };
  quotes.unshift(quote);
  saveAll(quotes);
  return quote;
}

module.exports = { loadAll, findById, create };
