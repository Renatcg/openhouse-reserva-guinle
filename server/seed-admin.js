// Gera/atualiza data/admin.json com o usuário administrador padrão.
// Rode com: npm run seed:admin
// (ou node server/seed-admin.js)
//
// Nunca guardamos a senha em texto puro — só o hash bcrypt.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const DEFAULT_ADMIN = {
  email: 'admin',
  password: 'Admin@12345',
};

function seed() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10);

  const admin = {
    email: DEFAULT_ADMIN.email,
    name: 'Renato',
    role: 'Administrador',
    passwordHash,
  };

  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2) + '\n');
  console.log(`✔ Usuário admin criado/atualizado em ${ADMIN_FILE}`);
  console.log(`  usuário: ${DEFAULT_ADMIN.email}`);
  console.log(`  senha:   ${DEFAULT_ADMIN.password}  (troque depois de testar!)`);
}

seed();
