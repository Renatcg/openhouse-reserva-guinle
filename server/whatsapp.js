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
// template aprovado. headerImageLink: URL pública da imagem (a Meta busca
// ela nesse link no momento do envio — precisa ser acessível publicamente).
async function sendTemplateMessage({ to, templateName, languageCode, headerImageLink, bodyParams }) {
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

module.exports = { isConfigured, sendTemplateMessage };
