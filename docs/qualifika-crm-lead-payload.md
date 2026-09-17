# Payload de envio de leads (indicações do Open House) → CRM Qualifika

## Contexto

No site do Open House Reserva Guinle, depois que um convidado confirma presença, ele pode indicar um amigo (nome + telefone) numa tela de "conhece alguém que adoraria viver aqui?". Toda indicação preenchida deve virar um lead no CRM Qualifika.

O site (Node/Express) já está pronto pra mandar esse payload — só falta o CRM ter um endpoint que receba e crie o lead.

## O que o site envia

**Método:** `POST`
**URL:** configurável via variável de ambiente `QUALIFIKA_CRM_WEBHOOK_URL` no servidor do site (ainda não definida — aguardando o endpoint existir)
**Autenticação:** header `Authorization: Bearer <QUALIFIKA_CRM_API_KEY>` (variável de ambiente separada, opcional — só é enviado se estiver configurada)
**Content-Type:** `application/json`

### Corpo (JSON) — exemplo real

```json
{
  "origin": "IND OPENHOUSE",
  "base": "IND OPENHOUSE",
  "lead": {
    "name": "Marina Souza",
    "phone": "5511977776666",
    "email": "openhouse@email.com"
  },
  "referredBy": {
    "name": "Marcelo Guimarães",
    "phone": "5511999998888",
    "email": "marcelo@exemplo.com"
  },
  "event": {
    "day": "dia1",
    "dayLabel": "Dia 1",
    "dateLabel": "09 de outubro"
  },
  "source": "site-rsvp-openhouse",
  "createdAt": "2026-09-17T17:24:46.343Z"
}
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `origin` / `base` | string | Sempre `"IND OPENHOUSE"` — fixo, é a origem/base que identifica esse lead como vindo da indicação do Open House. Os dois campos vêm com o mesmo valor porque não sei qual nome o CRM espera; o Codex pode manter só o que fizer sentido lá e descartar o outro. |
| `lead.name` | string | Nome da pessoa indicada (preenchido pelo convidado). |
| `lead.phone` | string | Telefone da pessoa indicada, dígitos normalizados (só números, com DDI 55 quando aplicável). |
| `lead.email` | string | **Sempre fixo:** `"openhouse@email.com"` — é um e-mail fictício porque o formulário de indicação não coleta e-mail, e o CRM provavelmente exige o campo. |
| `referredBy.name` | string | Nome (ou nome do representante, se for empresa) do convidado que fez a indicação. |
| `referredBy.phone` | string | Telefone cadastrado do convidado que indicou. |
| `referredBy.email` | string | E-mail do convidado que indicou, se tiver (pode vir vazio `""`). |
| `event.day` | string | Chave interna do dia do evento (`"dia1"`, `"dia2"` ou `"dia3"`). |
| `event.dayLabel` | string | Rótulo legível do dia (ex.: `"Dia 1"`). |
| `event.dateLabel` | string | Data legível (ex.: `"09 de outubro"`). |
| `source` | string | Sempre `"site-rsvp-openhouse"` — identifica o sistema de origem, caso o CRM aceite leads de mais de uma fonte. |
| `createdAt` | string | Timestamp ISO 8601 (UTC) de quando a indicação foi enviada. |

### Resposta esperada

O site não depende do corpo da resposta — só confere o status HTTP:
- `2xx` → sucesso, nada mais é feito.
- Qualquer outro status → o site loga o erro no console do servidor e segue normalmente (o envio do lead nunca trava ou falha a experiência do convidado que está indicando).

### Retentativas

Não há retentativa automática hoje. Se for importante não perder nenhum lead, faz sentido o endpoint responder rápido (< alguns segundos) e — do lado do CRM — validar e enfileirar o processamento internamente, em vez de depender do site tentar de novo.

## O que falta pro Codex fazer

1. Criar o endpoint que recebe esse payload (`POST`) e cria o lead no CRM Qualifika, usando `origin`/`base` = `IND OPENHOUSE` pra marcar a origem.
2. Definir a URL final e (se quiser autenticação) o token esperado no header `Authorization: Bearer <token>`.
3. Me passar a URL e o token pra eu configurar `QUALIFIKA_CRM_WEBHOOK_URL` e `QUALIFIKA_CRM_API_KEY` no ambiente do servidor do site (não fica hardcoded no código nem no repositório).

## Referência no código do site

- `server/crm.js` — monta o payload (`buildLeadPayload`) e envia (`sendLead`).
- `server/index.js`, rota `POST /api/rsvp/:token/indicar` — chama o `crm.js` toda vez que uma indicação é salva.
