// Conteúdo do convite (texto/imagem) por dia do evento, pros dois canais de
// disparo em massa: WhatsApp (via Datafy, que espelha a Cloud API da Meta) e
// e-mail (via Resend). Cada dia tem seu próprio conteúdo — imagem, texto do
// WhatsApp (template), o e-mail de convite e o e-mail de confirmação
// (disparado automaticamente quando o convidado confirma presença).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'invite-content.json');

const DEFAULT_WHATSAPP_BODY =
  'Olá {{1}}! Você está convidado(a) para o Open House da Casa Modelo Reserva Guinle. ' +
  'Confirme sua presença: {{2}}';

const DEFAULT_EMAIL_SUBJECT = 'Você está convidado — Open House Reserva Guinle';
const DEFAULT_EMAIL_HTML =
  '<p>Olá {{nome}},</p>' +
  '<p>Será um prazer receber você no Open House do Reserva Guinle.</p>' +
  '<p>Preparamos um momento especial para que você conheça de perto a casa modelo e sinta a essência de um projeto que une arquitetura, natureza e bem-estar em perfeito equilíbrio.</p>' +
  '<p>Confira os detalhes no convite abaixo e confirme sua presença.</p>';

const DEFAULT_CONFIRMATION_SUBJECT = 'Reserva confirmada — Open House Reserva Guinle';
const DEFAULT_CONFIRMATION_INTRO_HTML =
  '<p>Será um prazer receber você e seus acompanhantes no Open House do Reserva Guinle.</p>' +
  '<p>Viveremos um momento muito especial, onde você poderá conhecer de perto a casa modelo e sentir a essência desse projeto, em perfeito equilíbrio com a natureza.</p>';
const DEFAULT_CONFIRMATION_CLOSING_HTML =
  '<p>Em breve enviaremos mais informações.</p>' +
  '<p>Qualquer dúvida, estamos à disposição.</p>';
const DEFAULT_CONFIRMATION_QUOTE = 'Sunset com vinhos, música e boa companhia, em meio à natureza.';
const DEFAULT_SCHEDULE = [
  { time: '15h30', title: 'Tour pela obra', text: 'Acompanhe de perto a evolução do empreendimento.' },
  { time: '17h00', title: 'Casa modelo', text: 'Sinta esse projeto autoral, em perfeito equilíbrio com a natureza.' },
];

function defaultDayContent() {
  return {
    imageWhatsapp: null,
    imageEmail: null,
    imageConfirmation: null,
    whatsappTemplateName: '',
    whatsappLanguage: 'pt_BR',
    whatsappBodyText: DEFAULT_WHATSAPP_BODY,
    emailSubject: DEFAULT_EMAIL_SUBJECT,
    emailHtml: DEFAULT_EMAIL_HTML,
    confirmationEmailSubject: DEFAULT_CONFIRMATION_SUBJECT,
    confirmationIntroHtml: DEFAULT_CONFIRMATION_INTRO_HTML,
    confirmationClosingHtml: DEFAULT_CONFIRMATION_CLOSING_HTML,
    confirmationQuote: DEFAULT_CONFIRMATION_QUOTE,
    confirmationSchedule: DEFAULT_SCHEDULE,
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    const initial = { dia1: defaultDayContent(), dia2: defaultDayContent(), dia3: defaultDayContent() };
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(initial, null, 2) + '\n');
  }
}

function loadAll() {
  ensureFile();
  const raw = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
  // Garante que dias novos (ou arquivo antigo incompleto) sempre tenham todos os campos.
  const defaults = defaultDayContent();
  ['dia1', 'dia2', 'dia3'].forEach(day => {
    raw[day] = { ...defaults, ...(raw[day] || {}) };
  });
  return raw;
}

function saveAll(content) {
  ensureFile();
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2) + '\n');
}

function getDay(day) {
  return loadAll()[day] || defaultDayContent();
}

const UPDATABLE_FIELDS = [
  'whatsappTemplateName', 'whatsappLanguage', 'whatsappBodyText',
  'emailSubject', 'emailHtml',
  'confirmationEmailSubject', 'confirmationIntroHtml', 'confirmationClosingHtml',
  'confirmationQuote', 'confirmationSchedule',
];

function updateDay(day, patch) {
  const all = loadAll();
  const current = all[day] || defaultDayContent();
  const next = { ...current };
  UPDATABLE_FIELDS.forEach(field => {
    if (field in patch) {
      if (field === 'confirmationSchedule') {
        next[field] = Array.isArray(patch[field]) ? patch[field] : current[field];
      } else if (field === 'whatsappLanguage') {
        next[field] = (patch[field] || 'pt_BR').trim();
      } else if (field === 'whatsappTemplateName') {
        next[field] = (patch[field] || '').trim();
      } else {
        next[field] = patch[field] || '';
      }
    }
  });
  all[day] = next;
  saveAll(all);
  return all[day];
}

function setImage(day, channel, relativePath) {
  const all = loadAll();
  const current = all[day] || defaultDayContent();
  const key = channel === 'email' ? 'imageEmail' : channel === 'confirmation' ? 'imageConfirmation' : 'imageWhatsapp';
  all[day] = { ...current, [key]: relativePath };
  saveAll(all);
  return all[day];
}

// Substitui os placeholders {{nome}}, {{link}}, {{dia}}, {{data}}, {{hora}}
// no HTML do e-mail (o WhatsApp usa {{1}}/{{2}} por exigência da Meta pra
// templates — mapeado separadamente).
function fillEmailTokens(html, { name, link, dayLabel, dateLabel, time }) {
  return (html || '')
    .replace(/\{\{\s*nome\s*\}\}/gi, escapeHtml(name || ''))
    .replace(/\{\{\s*link\s*\}\}/gi, link || '#')
    .replace(/\{\{\s*dia\s*\}\}/gi, escapeHtml(dayLabel || ''))
    .replace(/\{\{\s*data\s*\}\}/gi, escapeHtml(dateLabel || ''))
    .replace(/\{\{\s*hora\s*\}\}/gi, escapeHtml(time || ''));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Moldura visual compartilhada pelos e-mails (convite e confirmação) ----------
// Tabelas + estilo inline (compatibilidade com clientes de e-mail). Mantém a
// identidade visual do site: barra superior verde-musgo com a marca, fundo
// creme, tipografia serifada nos títulos.

const BRAND_HEADER_ROW = `
      <tr>
        <td style="background:#c7cbb0;padding:22px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:15px;letter-spacing:3px;color:#1f3327;font-weight:bold;">RESERVA GUINLE</td>
              <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;color:#33402f;line-height:1.7;">NATUREZA<br/>ARQUITETURA<br/>BEM-ESTAR<br/>VIDA REAL</td>
            </tr>
            <tr>
              <td colspan="2" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;color:#3d4a37;padding-top:4px;">TERESÓPOLIS · RJ</td>
            </tr>
          </table>
        </td>
      </tr>`;

// withHeader controla se a barra de marca verde-musgo aparece no topo do
// e-mail. No convite ela NÃO aparece — a peça gráfica que já tem essa
// identidade (o convite em si, enviado como imagem) faz esse papel; o
// e-mail em volta dela fica simples, só texto. Na confirmação a barra
// aparece porque não há uma peça gráfica equivalente.
function emailShell(bodyHtml, { withHeader = false } = {}) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#eceee2;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceee2;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#f6f3ec;border-radius:12px;overflow:hidden;">
      ${withHeader ? BRAND_HEADER_ROW : ''}
      <tr>
        <td style="padding:32px;">
          ${bodyHtml}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// E-mail de convite: introdução editável pelo admin + imagem do convite (a
// peça gráfica, com a marca já embutida nela) + botão de confirmação. Sem
// barra de marca própria — só texto simples em volta da peça, como no
// modelo de referência.
function renderInviteEmail({ introHtml, imageUrl, link }) {
  const body = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2a22;">${introHtml || ''}</div>
    ${imageUrl ? `<div style="margin:24px 0;"><img src="${imageUrl}" alt="" style="width:100%;max-width:536px;display:block;border-radius:8px;" /></div>` : ''}
    <div style="text-align:center;margin-top:8px;">
      <a href="${link}" style="display:inline-block;background:#1f3327;color:#f6f3ec;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:1px;font-weight:bold;text-decoration:none;padding:16px 36px;border-radius:10px;">CONFIRMAR PRESENÇA</a>
    </div>
    <hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:28px 0 16px;" />
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#1f2a22;margin:0 0 4px;">Esperamos você!</p>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a8578;margin:0;">Equipe Reserva Guinle</p>
  `;
  return emailShell(body);
}

// E-mail de confirmação: título + introdução editável + bloco de
// data/programação/local + banner de imagem com frase de destaque + fechamento editável.
function renderConfirmationEmail({ introHtml, closingHtml, dateLabel, weekday, schedule, locationLines, quote, imageUrl }) {
  const scheduleHtml = (schedule || []).map(item => `
    <div style="margin-bottom:14px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#1f2a22;padding-right:8px;vertical-align:top;white-space:nowrap;">${escapeHtml(item.time || '')}</td>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f2a22;">
          <span style="font-weight:bold;">${escapeHtml(item.title || '')}</span><br/>
          <span style="color:#5c5c52;">${escapeHtml(item.text || '')}</span>
        </td>
      </tr></table>
    </div>
  `).join('');

  const body = `
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:34px;color:#1f3327;margin:0 0 6px;">Reserva confirmada</p>
    <div style="width:40px;height:2px;background:#c8a862;margin:0 0 18px;"></div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2a22;margin-bottom:22px;">${introHtml || ''}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="width:33%;vertical-align:top;padding-right:12px;">
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;color:#8a8578;margin:0 0 6px;">DATA</p>
          <p style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#1f2a22;margin:0 0 2px;">${escapeHtml(dateLabel || '')}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;color:#8a8578;margin:0;text-transform:uppercase;">${escapeHtml(weekday || '')}</p>
        </td>
        <td style="width:34%;vertical-align:top;padding:0 12px;border-left:1px solid rgba(0,0,0,0.08);border-right:1px solid rgba(0,0,0,0.08);">
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;color:#8a8578;margin:0 0 8px;">PROGRAMAÇÃO</p>
          ${scheduleHtml}
        </td>
        <td style="width:33%;vertical-align:top;padding-left:12px;">
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;color:#8a8578;margin:0 0 6px;">LOCAL</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2a22;margin:0 0 4px;">${escapeHtml((locationLines && locationLines[0]) || '')}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1px;color:#8a8578;margin:0;text-transform:uppercase;">${escapeHtml((locationLines && locationLines[1]) || '')}<br/>${escapeHtml((locationLines && locationLines[2]) || '')}</p>
        </td>
      </tr>
    </table>

    ${imageUrl ? `
    <div style="position:relative;margin-bottom:24px;">
      <img src="${imageUrl}" alt="" style="width:100%;max-width:536px;display:block;border-radius:6px;" />
    </div>
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#1f2a22;line-height:1.35;margin:-14px 0 24px;">${escapeHtml(quote || '')}</p>
    ` : quote ? `<p style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#1f2a22;line-height:1.35;margin:0 0 24px;">${escapeHtml(quote)}</p>` : ''}

    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2a22;margin-bottom:22px;">${closingHtml || ''}</div>

    <hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:0 0 16px;" />
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1f2a22;margin:0;">Equipe Reserva Guinle</p>
  `;
  return emailShell(body, { withHeader: true });
}

module.exports = {
  loadAll,
  getDay,
  updateDay,
  setImage,
  fillEmailTokens,
  escapeHtml,
  renderInviteEmail,
  renderConfirmationEmail,
};
