// Integração com o CRM Qualifika: envia um lead toda vez que alguém indica um
// amigo na tela de confirmação (POST /api/rsvp/:token/indicar).
//
// Isso é um "best-effort" — nunca derruba a resposta pro usuário se o CRM
// estiver fora do ar ou a variável de ambiente não estiver configurada
// ainda (é só logar e seguir, igual ao sendConfirmationEmail em index.js).
//
// Pra ativar de verdade, defina no ambiente do servidor (nunca no repo):
//   QUALIFIKA_CRM_WEBHOOK_URL  — endpoint que o Codex vai criar lá no CRM
//   QUALIFIKA_CRM_API_KEY      — token de autenticação (enviado como Bearer)
//
// O formato exato do payload está documentado em docs/qualifika-crm-lead-payload.md
// (nesse repo) — é o que deve ser passado pro Codex construir o endpoint.

const WEBHOOK_URL = process.env.QUALIFIKA_CRM_WEBHOOK_URL;
const API_KEY = process.env.QUALIFIKA_CRM_API_KEY;

const LEAD_ORIGIN = 'IND OPENHOUSE';
const FICTITIOUS_EMAIL = 'openhouse@email.com';

function isConfigured() {
  return Boolean(WEBHOOK_URL);
}

// guest: o convidado que confirmou e está indicando (rsvp.findByToken(...)).
// referral: { name, phone } — a pessoa indicada, já salva em guest via setReferral.
// dayInfo: rsvp.DAYS[guest.day] — pra mandar rótulo/data legíveis também.
function buildLeadPayload({ guest, referral, dayInfo }) {
  const referrerName = (guest.representative || guest.label || (guest.confirmation && guest.confirmation.name) || '').trim();

  return {
    origin: LEAD_ORIGIN,
    base: LEAD_ORIGIN,
    lead: {
      name: referral.name,
      phone: referral.phone,
      email: FICTITIOUS_EMAIL,
    },
    referredBy: {
      name: referrerName,
      phone: guest.phone || '',
      email: (guest.confirmation && guest.confirmation.email) || (guest.contact && guest.contact.email) || '',
    },
    event: {
      day: guest.day,
      dayLabel: dayInfo ? dayInfo.label : guest.day,
      dateLabel: dayInfo ? dayInfo.dateLabel : '',
    },
    source: 'site-rsvp-openhouse',
    createdAt: new Date().toISOString(),
  };
}

async function sendLead(payload) {
  if (!isConfigured()) {
    console.log('[crm] QUALIFIKA_CRM_WEBHOOK_URL não configurada — lead não enviado (payload abaixo, só pra log):', JSON.stringify(payload));
    return;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[crm] Falha ao enviar lead pro Qualifika (HTTP ${res.status}):`, text);
    }
  } catch (err) {
    console.error('[crm] Erro de conexão ao enviar lead pro Qualifika:', err.message);
  }
}

module.exports = { isConfigured, buildLeadPayload, sendLead, LEAD_ORIGIN, FICTITIOUS_EMAIL };
