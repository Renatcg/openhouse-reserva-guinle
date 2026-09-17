// Cliente pra API de WhatsApp Business (via Datafy, que espelha 1:1 a Cloud
// API oficial da Meta — mesmo formato de request/response, só muda a URL
// base e o token).
//
// IMPORTANTE (política da Meta): uma empresa só pode INICIAR uma conversa
// (ex: convite em massa pra alguém que não escreveu antes) usando um
// "Message Template" pré-aprovado pela Meta — nunca texto livre. Por isso
// sendTemplateMessage() sempre manda `type: "template"`, nunca `type: "text"`,
// mesmo que o texto pareça simples. O nome do template e o idioma usados
// aqui precisam bater exatamente com um template já aprovado na sua conta.

const BASE_URL = process.env.WHATSAPP_API_BASE || 'https://cloud.datafyapi.com.br/v1';
const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

function isConfigured() {
  return Boolean(TOKEN && PHONE_NUMBER_ID);
}

// bodyParams: array de strings, na ordem das variáveis {{1}}, {{2}}... do
// CORPO do template aprovado (aqui, só o primeiro nome — o template atual
// não tem link no corpo). headerImageLink: URL pública da imagem (a Meta
// busca ela nesse link no momento do envio — precisa ser acessível
// publicamente). buttonUrlParam: valor que completa a URL dinâmica do botão
// (o template tem um botão "Acessar site" com URL base já cadastrada na
// Meta, tipo "https://rsvp.qualifika.com.br/?t=", e só o pedaço variável —
// o token do convidado — é mandado aqui; NÃO é o link inteiro).
async function sendTemplateMessage({ to, templateName, languageCode, headerImageLink, bodyParams, buttonUrlParam }) {
  if (!isConfigured()) {
    throw new Error('WhatsApp não configurado. Defina WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.');
  }
  if (!templateName) {
    throw new Error('Informe o nome do template aprovado na Meta antes de enviar.');
  }

  const components = [];
  if (headerImageLink) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageLink } }] });
  }
  if (bodyParams && bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text: String(text) })) });
  }
  if (buttonUrlParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: String(buttonUrlParam) }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'pt_BR' },
      components,
    },
  };

  const res = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Falha ao enviar (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

// Mensagem de texto livre — só é permitida pela Meta dentro da "janela de
// 24h" de uma conversa já iniciada pelo destinatário (ex.: responder alguém
// que acabou de escrever pro número). Serve aqui só pra teste manual do
// TEXTO/modelo da mensagem, quando quem está testando manda um "oi" antes
// pro número — nunca use isso pra iniciar contato com um convidado que
// nunca escreveu, a Meta bloqueia (e pode penalizar a conta).
async function sendTextMessage({ to, body }) {
  if (!isConfigured()) {
    throw new Error('WhatsApp não configurado. Defina WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.');
  }
  if (!body || !body.trim()) {
    throw new Error('Informe o texto da mensagem.');
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  };

  const res = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Falha ao enviar (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

// Mensagem de imagem avulsa (sem texto) — mesma regra da mensagem de texto:
// só dentro da janela de 24h. Usada no teste de modelo pra mostrar a imagem
// do convite antes do texto, já que uma mensagem type:"text" não tem campo
// de imagem (isso só existe no header de um template aprovado).
async function sendImageMessage({ to, link, caption }) {
  if (!isConfigured()) {
    throw new Error('WhatsApp não configurado. Defina WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.');
  }
  if (!link) {
    throw new Error('Informe o link público da imagem.');
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: caption ? { link, caption } : { link },
  };

  const res = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Falha ao enviar (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

module.exports = { isConfigured, sendTemplateMessage, sendTextMessage, sendImageMessage };
