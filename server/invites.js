// Conteúdo do convite (texto/imagem) por dia do evento, pros dois canais de
// disparo em massa: WhatsApp (via Datafy, que espelha a Cloud API da Meta) e
// e-mail (via Resend). Cada dia tem seu próprio conteúdo — imagem, texto do
// WhatsApp (template) e o e-mail (rico, HTML).

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
  '<p>Você está convidado(a) para o <strong>Open House da Casa Modelo Reserva Guinle</strong>.</p>' +
  '<p><a href="{{link}}">Confirmar presença</a></p>';

function defaultDayContent() {
  return {
    imageWhatsapp: null,
    imageEmail: null,
    whatsappTemplateName: '',
    whatsappLanguage: 'pt_BR',
    whatsappBodyText: DEFAULT_WHATSAPP_BODY,
    emailSubject: DEFAULT_EMAIL_SUBJECT,
    emailHtml: DEFAULT_EMAIL_HTML,
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
  // Garante que dias novos (ou arquivo antigo incompleto) sempre tenham um valor padrão.
  ['dia1', 'dia2', 'dia3'].forEach(day => {
    if (!raw[day]) raw[day] = defaultDayContent();
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

function updateDay(day, patch) {
  const all = loadAll();
  const current = all[day] || defaultDayContent();
  all[day] = {
    ...current,
    ...('whatsappTemplateName' in patch ? { whatsappTemplateName: (patch.whatsappTemplateName || '').trim() } : {}),
    ...('whatsappLanguage' in patch ? { whatsappLanguage: (patch.whatsappLanguage || 'pt_BR').trim() } : {}),
    ...('whatsappBodyText' in patch ? { whatsappBodyText: patch.whatsappBodyText || '' } : {}),
    ...('emailSubject' in patch ? { emailSubject: patch.emailSubject || '' } : {}),
    ...('emailHtml' in patch ? { emailHtml: patch.emailHtml || '' } : {}),
  };
  saveAll(all);
  return all[day];
}

function setImage(day, channel, relativePath) {
  const all = loadAll();
  const current = all[day] || defaultDayContent();
  const key = channel === 'email' ? 'imageEmail' : 'imageWhatsapp';
  all[day] = { ...current, [key]: relativePath };
  saveAll(all);
  return all[day];
}

// Substitui os placeholders {{nome}}, {{link}}, {{dia}}, {{data}} no HTML do
// e-mail ou no texto do WhatsApp (que usa {{1}}/{{2}} por exigência da Meta
// pra templates — mapeado separadamente).
function fillEmailTokens(html, { name, link, dayLabel, dateLabel }) {
  return (html || '')
    .replace(/\{\{\s*nome\s*\}\}/gi, escapeHtml(name || ''))
    .replace(/\{\{\s*link\s*\}\}/gi, link || '#')
    .replace(/\{\{\s*dia\s*\}\}/gi, escapeHtml(dayLabel || ''))
    .replace(/\{\{\s*data\s*\}\}/gi, escapeHtml(dateLabel || ''));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  loadAll,
  getDay,
  updateDay,
  setImage,
  fillEmailTokens,
  escapeHtml,
};
