// Helpers de leitura/escrita do "banco" de categorias (arquivo JSON simples).
// Categorias só têm criação e edição de título — sem exclusão por enquanto,
// já que produtos existentes referenciam categorias pelo nome.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CATEGORIES_FILE)) fs.writeFileSync(CATEGORIES_FILE, '[]\n');
}

function loadAll() {
  ensureFile();
  return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
}

function saveAll(categories) {
  ensureFile();
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2) + '\n');
}

function findById(id) {
  return loadAll().find(c => c.id === id) || null;
}

function create(data) {
  const categories = loadAll();
  const now = new Date().toISOString();
  const category = {
    id: crypto.randomUUID(),
    title: data.title,
    createdAt: now,
    updatedAt: now,
  };
  categories.push(category);
  saveAll(categories);
  return category;
}

function update(id, data) {
  const categories = loadAll();
  const idx = categories.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const updated = {
    ...categories[idx],
    title: data.title ?? categories[idx].title,
    updatedAt: new Date().toISOString(),
  };
  categories[idx] = updated;
  saveAll(categories);
  return updated;
}

module.exports = { loadAll, findById, create, update };
