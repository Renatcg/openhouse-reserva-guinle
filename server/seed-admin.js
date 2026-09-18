// Cria/atualiza usuários com acesso ao admin do catálogo em
// data/admin-users.json (server/adminUsers.js). Rode com:
//   node server/seed-admin.js
//
// Na primeira execução, se não existir data/admin-users.json mas existir o
// antigo data/admin.json, o usuário único de lá é migrado automaticamente
// pra lista (feito dentro de adminUsers.js). Aqui só garantimos que os
// usuários abaixo existam, sem duplicar.

const adminUsers = require('./adminUsers');

const USERS_TO_SEED = [
  { email: 'admin', name: 'Renato', role: 'Administrador', password: 'Admin@12345' },
  { email: 'riga', name: 'Larissa', role: 'Administrador', password: 'Riga@12345' },
];

function seed() {
  for (const u of USERS_TO_SEED) {
    const existing = adminUsers.findByEmail(u.email);
    if (existing) {
      console.log(`• Usuário "${u.email}" já existe — mantido como está.`);
      continue;
    }
    adminUsers.create(u);
    console.log(`✔ Usuário "${u.email}" (${u.name}) criado.`);
    console.log(`  usuário: ${u.email}`);
    console.log(`  senha:   ${u.password}  (troque depois de testar!)`);
  }
}

seed();
