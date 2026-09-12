# Open House Reserva Guinle

Dois sistemas simples (HTML + Tailwind CDN, sem frameworks front, backend Node/Express mínimo):

1. **Catálogo de produtos** (`/index.html`) — página pública, seleção de itens + orçamento por WhatsApp.
2. **Painel admin do catálogo** (`/login.html` → `/admin/produtos.html`) — login com JWT, cadastro/gestão de produtos e categorias.
3. **RSVP** — confirmação de presença por link único, tokenizado, por convidado. Tem seu **próprio ambiente de admin**, com login e senha completamente separados do catálogo (`/admin/rsvp-login.html` → `/admin/rsvp-convidados.html`), e webhook de consulta para o pipeline da Mauad.

Os dois ambientes rodam no mesmo processo/serviço (não são dois deploys separados), mas usam usuário, senha e cookie de sessão diferentes — logar em um não dá acesso ao outro.

## Como rodar localmente

```bash
npm install
npm run seed:admin        # cria data/admin.json — usuário do catálogo (rode de novo se trocar a senha)
npm run seed:rsvp-admin    # cria data/rsvp-admin.json — usuário do RSVP (independente do de cima)
cp .env.example .env       # ajuste o JWT_SECRET para algo aleatório antes de ir pra produção
npm start
```

Acesse:
- Catálogo: http://localhost:3000/index.html
- Login admin do catálogo: http://localhost:3000/login.html
- Login admin do RSVP: http://localhost:3000/admin/rsvp-login.html

**Usuário admin padrão do catálogo:** `admin` / `Admin@12345` (definido em `server/seed-admin.js` — troque depois de testar).
**Usuário admin padrão do RSVP:** `rsvp` / `Rsvp@12345` (definido em `server/seed-rsvp-admin.js` — troque depois de testar).

## Estrutura

```
public/
  index.html              catálogo (mobile + desktop)
  login.html               login do admin do catálogo
  admin/
    produtos.html          lista de produtos cadastrados (protegida — sessão do catálogo)
    rsvp-login.html         login do admin do RSVP (ambiente separado)
    rsvp-convidados.html   lista de convidados/confirmações (protegida — sessão do RSVP)
server/
  index.js                 servidor Express (estáticos + API)
  auth.js                   fábrica de middlewares JWT (cookie httpOnly) — uma instância por ambiente
  seed-admin.js             gera data/admin.json com hash bcrypt da senha (catálogo)
  seed-rsvp-admin.js        gera data/rsvp-admin.json com hash bcrypt da senha (RSVP)
data/
  admin.json                usuário admin do catálogo (hash bcrypt, sem senha em texto puro)
  rsvp-admin.json            usuário admin do RSVP (hash bcrypt, sem senha em texto puro)
```

## Segurança do login

- Senha nunca fica em texto puro — só o hash bcrypt (`data/admin.json` e `data/rsvp-admin.json`).
- Cada ambiente (catálogo e RSVP) tem sua própria sessão: **JWT assinado**, cookie `httpOnly` separado por ambiente (`og_session` no catálogo, `rsvp_admin_session` no RSVP) — não acessível por JavaScript no navegador, mitigando XSS.
- `/admin/*` é protegido no próprio servidor Express antes de servir o HTML: `requireAuthPage` (catálogo) para a maioria das páginas, e um middleware equivalente próprio do RSVP só para `rsvp-convidados.html`.
- Rotas de API exigem sessão válida do ambiente correspondente (`/api/me` + `requireAuthApi` no catálogo, `/api/rsvp/me` + sua própria checagem no RSVP).

## Deploy no EasyPanel

O projeto já tem um `Dockerfile` na raiz, então o EasyPanel consegue buildar direto do GitHub sem configuração extra de build.

1. No EasyPanel, crie um novo serviço do tipo **App** → **From GitHub** (ou "From Source"), conecte sua conta do GitHub e selecione o repositório `openhouse-reserva-guinle`, branch `main`.
2. Em **Build**, deixe o método como **Dockerfile** (ele detecta automaticamente pelo arquivo na raiz).
3. Em **Environment**, adicione as variáveis:
   - `JWT_SECRET` — uma string aleatória longa (gere uma nova, não reuse a de exemplo do `.env.example`).
   - `NODE_ENV` = `production`
   (o `PORT` já vem `3000` do Dockerfile; não precisa mexer.)
4. Em **Domains**, aponte o domínio/subdomínio desejado para a porta `3000` — o EasyPanel cuida do HTTPS automaticamente.
5. Em **Volumes** (ou "Mounts"), adicione dois volumes persistentes — sem isso, cada novo deploy apaga os produtos, convidados e fotos cadastrados:
   - `/app/data` (guarda `admin.json`, `rsvp-admin.json`, `products.json`, `categories.json`, `guests.json`)
   - `/app/public/uploads` (guarda as fotos dos produtos)
6. Deploy. No primeiro deploy, os arquivos que já vieram do repositório servem de ponto de partida (usuário admin padrão do catálogo `admin` / `Admin@12345`, e do RSVP `rsvp` / `Rsvp@12345` — troque as duas senhas depois criando um novo hash e rodando `npm run seed:admin` / `npm run seed:rsvp-admin` localmente, ou trocando manualmente).
7. Depois de rodando, ative **auto-deploy** nas configurações do serviço para que todo `git push` na branch `main` suba automaticamente uma nova versão.

**Importante:** troque a senha padrão do admin antes de divulgar o link publicamente.
