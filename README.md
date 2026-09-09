# Open House Reserva Guinle

Dois sistemas simples (HTML + Tailwind CDN, sem frameworks front, backend Node/Express mínimo):

1. **Catálogo de produtos** (`/index.html`) — página pública, seleção de itens + orçamento por WhatsApp.
2. **Painel admin** (`/login.html` → `/admin/produtos.html`) — login com JWT, cadastro/gestão de produtos.
3. **RSVP** (a construir) — confirmação de presença por link único por convidado.

## Como rodar localmente

```bash
npm install
npm run seed:admin      # cria data/admin.json com o usuário admin (rode de novo se trocar a senha)
cp .env.example .env    # ajuste o JWT_SECRET para algo aleatório antes de ir pra produção
npm start
```

Acesse:
- Catálogo: http://localhost:3000/index.html
- Login admin: http://localhost:3000/login.html

**Usuário admin padrão:** `admin` / `Admin@12345` (definido em `server/seed-admin.js` — troque depois de testar).

## Estrutura

```
public/
  index.html            catálogo (mobile + desktop)
  login.html            login do admin
  admin/
    produtos.html        lista de produtos cadastrados (protegida)
server/
  index.js               servidor Express (estáticos + API)
  auth.js                 middlewares JWT (cookie httpOnly)
  seed-admin.js           gera data/admin.json com hash bcrypt da senha
data/
  admin.json              usuário admin (hash bcrypt, sem senha em texto puro)
```

## Segurança do login

- Senha nunca fica em texto puro — só o hash bcrypt em `data/admin.json`.
- Sessão via **JWT assinado**, guardado em cookie `httpOnly` (não acessível por JavaScript no navegador, mitigando XSS).
- `/admin/*` é protegido no próprio servidor Express (`requireAuthPage`) — sem sessão válida, redireciona pro login antes mesmo de servir o HTML.
- Rotas de API (`/api/me`) exigem sessão válida (`requireAuthApi`).
