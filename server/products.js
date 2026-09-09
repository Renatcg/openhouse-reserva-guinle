// Helpers de leitura/escrita do "banco" de produtos (arquivo JSON simples).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]\n');
}

function loadAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
}

function saveAll(products) {
  ensureFile();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2) + '\n');
}

function findById(id) {
  return loadAll().find(p => p.id === id) || null;
}

function create(data) {
  const products = loadAll();
  const now = new Date().toISOString();
  const product = {
    id: crypto.randomUUID(),
    title: data.title,
    description: data.description,
    category: data.category,
    room: data.room || '',
    status: data.status === 'Inativo' ? 'Inativo' : 'Ativo',
    images: data.images || [],
    createdAt: now,
    updatedAt: now,
  };
  products.unshift(product);
  saveAll(products);
  return product;
}

function update(id, data) {
  const products = loadAll();
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const existing = products[idx];
  const updated = {
    ...existing,
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    category: data.category ?? existing.category,
    room: data.room ?? existing.room,
    status: data.status === 'Inativo' ? 'Inativo' : (data.status === 'Ativo' ? 'Ativo' : existing.status),
    images: data.images ?? existing.images,
    updatedAt: new Date().toISOString(),
  };
  products[idx] = updated;
  saveAll(products);
  return updated;
}

function remove(id) {
  const products = loadAll();
  const next = products.filter(p => p.id !== id);
  const removed = next.length !== products.length;
  if (removed) saveAll(next);
  return removed;
}

module.exports = { loadAll, findById, create, update, remove };
