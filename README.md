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

## Deploy no EasyPanel

O projeto já tem um `Dockerfile` na raiz, então o EasyPanel consegue buildar direto do GitHub sem configuração extra de build.

1. No EasyPanel, crie um novo serviço do tipo **App** → **From GitHub** (ou "From Source"), conecte sua conta do GitHub e selecione o repositório `openhouse-reserva-guinle`, branch `main`.
2. Em **Build**, deixe o método como **Dockerfile** (ele detecta automaticamente pelo arquivo na raiz).
3. Em **Environment**, adicione as variáveis:
   - `JWT_SECRET` — uma string aleatória longa (gere uma nova, não reuse a de exemplo do `.env.example`).
   - `NODE_ENV` = `production`
   (o `PORT` já vem `3000` do Dockerfile; não precisa mexer.)
4. Em **Domains**, aponte o domínio/subdomínio desejado para a porta `3000` — o EasyPanel cuida do HTTPS automaticamente.
5. Em **Volumes** (ou "Mounts"), adicione dois volumes persistentes — sem isso, cada novo deploy apaga os produtos cadastrados e as fotos:
   - `/app/data` (guarda `admin.json` e `products.json`)
   - `/app/public/uploads` (guarda as fotos dos produtos)
6. Deploy. No primeiro deploy, os arquivos `data/admin.json` e `data/products.json` que já vieram do repositório servem de ponto de partida (usuário admin padrão `admin` / `Admin@12345` — troque a senha depois criando um novo hash e rodando `npm run seed:admin` localmente, ou trocando manualmente).
7. Depois de rodando, ative **auto-deploy** nas configurações do serviço para que todo `git push` na branch `main` suba automaticamente uma nova versão.

**Importante:** troque a senha padrão do admin antes de divulgar o link publicamente.
