#!/usr/bin/env node
/**
 * Archii — Cron Job: Agenda Notifications (Standalone)
 *
 * Este script se ejecuta como cron del sistema (NO depende de Vercel).
 * Verifica las actividades de la agenda diaria y envía notificaciones
 * cuando una actividad está por empezar.
 *
 * Canales de notificación:
 *   - Push (Web Push via VAPID)
 *   - WhatsApp (Meta Cloud API)
 *   - Email (Resend API)
 *
 * Uso:
 *   node scripts/cron-agenda-notifications.js
 *   node scripts/cron-agenda-notifications.js --type hourly
 *   node scripts/cron-agenda-notifications.js --type daily
 *   node scripts/cron-agenda-notifications.js --type all
 *
 * Cron (cada 5 minutos):
 *   */5 * * * * cd /path/to/archii && node scripts/cron-agenda-notifications.js >> /var/log/archii-cron.log 2>&1
 *
 * Variables de entorno requeridas (en .env.local):
 *   FIREBASE_ADMIN_CREDENTIALS — JSON de service account
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID — ID del proyecto Firebase
 *   VAPID_SUBJECT — mailto: o URL del sitio
 *   VAPID_PRIVATE_KEY — Clave privada VAPID
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY — Clave pública VAPID
 *   RESEND_API_KEY — API key de Resend (opcional, para email)
 *   WHATSAPP_TOKEN — Token de WhatsApp Business (opcional)
 *   WHATSAPP_PHONE_NUMBER_ID — ID del número de WhatsApp (opcional)
 *   CRON_SECRET — Secreto para evitar ejecuciones no autorizadas
 */

const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const webpush = require('web-push');

// ─── Load .env.local ───
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// ─── Constants ───
const CRON_SECRET = process.env.CRON_SECRET;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// ─── Colombia timezone helpers ───
function todayColombia() {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);
  return colombiaTime.toISOString().split('T')[0];
}

function colombiaHour() {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);
  return colombiaTime.getHours();
}

function colombiaMinute() {
  const now = new Date();
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const colombiaTime = new Date(utcMs + colombiaOffset * 60000);
  return colombiaTime.getHours() * 60 + colombiaTime.getMinutes();
}

function formatHour12(h) {
  if (h === 0 || h === 12) return h === 0 ? '12:00 am' : '12:00 pm';
  return h > 12 ? `${h - 12}:00 pm` : `${h}:00 am`;
}

// ─── Firebase Admin Init ───
let _db = null;

function getDb() {
  if (_db) return _db;

  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
  let credential;

  if (credJson) {
    try {
      const parsed = JSON.parse(credJson);
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        if (parsed.private_key.includes('\\n')) {
          parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
        }
      }
      credential = cert(parsed);
    } catch (e) {
      console.error('[Archii Cron] Error parsing FIREBASE_ADMIN_CREDENTIALS:', e.message);
      process.exit(1);
    }
  }

  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const config = { projectId: FIREBASE_PROJECT_ID };
    if (credential) config.credential = credential;
    app = initializeApp(config);
  }

  _db = getFirestore(app);
  return _db;
}

// ─── Dedup helpers ───
async function wasRecentlyNotified(db, key, hours = 2) {
  const doc = await db.collection('cronNotifLog').doc(key).get();
  if (!doc.exists) return false;
  const lastSent = doc.data()?.sentAt;
  if (!lastSent) return false;
  const sentDate = lastSent.toDate ? lastSent.toDate() : new Date(lastSent);
  return Date.now() - sentDate.getTime() < hours * 60 * 60 * 1000;
}

async function markNotified(db, key) {
  await db.collection('cronNotifLog').doc(key).set({
    sentAt: new Date(),
    key,
  }, { merge: true });
}

// ─── Push notification ───
async function sendPushToUser(db, userId, title, body, data = {}) {
  try {
    const subDoc = await db.collection('pushSubscriptions').doc(userId).get();
    if (!subDoc.exists) return false;

    const subData = subDoc.data();
    if (!subData?.active || !subData?.endpoint) return false;

    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@archii.app';
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!privateKey || !publicKey) return false;

    webpush.setVapidDetails(subject, publicKey, privateKey);

    await webpush.sendNotification(
      {
        endpoint: subData.endpoint,
        keys: subData.keys,
      },
      JSON.stringify({ title, body, icon: '/icon-192.png', data }),
      { TTL: 86400, urgency: 'normal' }
    );
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Subscription expired — deactivate
      try {
        await db.collection('pushSubscriptions').doc(userId).update({ active: false });
      } catch {}
    }
    console.warn(`[Archii Cron] Push failed for ${userId}:`, err.message?.substring(0, 80));
    return false;
  }
}

// ─── WhatsApp notification ───
async function sendWhatsAppToUser(db, userId, message) {
  try {
    const linkDoc = await db.collection('whatsappLinks').doc(userId).get();
    if (!linkDoc.exists) return false;
    const linkData = linkDoc.data();
    if (!linkData?.active || !linkData?.whatsappPhone) return false;

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return false;

    const phone = linkData.whatsappPhone.replace(/\D/g, '');
    const response = await fetch(
      `https://graph.facebook.com/v17.0/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    return response.ok;
  } catch (err) {
    console.warn(`[Archii Cron] WhatsApp failed for ${userId}:`, err.message?.substring(0, 80));
    return false;
  }
}

// ─── Email notification ───
async function sendEmailToUser(email, subject, html) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return false;

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'notificaciones@archii.app';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Archii <${fromEmail}>`,
        to: [email],
        subject,
        html,
      }),
    });

    return response.ok;
  } catch (err) {
    console.warn(`[Archii Cron] Email failed for ${email}:`, err.message?.substring(0, 80));
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN: Check Agenda Starting Reminders
// ═══════════════════════════════════════════════════════════════

async function checkAgendaStartingReminders() {
  const db = getDb();
  const today = todayColombia();
  const currentMinute = colombiaMinute();

  // Only run between 7am-8pm Colombia time
  const currentHour = Math.floor(currentMinute / 60);
  if (currentHour < 7 || currentHour > 20) {
    console.log(`[Archii Cron] Outside working hours (${currentHour}:00 Colombia), skipping agenda checks.`);
    return { sent: 0, skipped: 0 };
  }

  // Get tasks with agendaMeta for today
  const snap = await db.collection('tasks')
    .where('status', '!=', 'Completado')
    .get();

  const todayAgendaTasks = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t =>
      t.agendaMeta?.dayKey === today &&
      t.agendaMeta?.hourSlots &&
      t.agendaMeta.hourSlots.length > 0
    );

  console.log(`[Archii Cron] Found ${todayAgendaTasks.length} agenda tasks for today (${today})`);

  let sent = 0;
  let skipped = 0;

  for (const task of todayAgendaTasks) {
    const startHour = Math.min(...task.agendaMeta.hourSlots);
    const startMinute = startHour * 60;
    const minutesUntil = startMinute - currentMinute;

    // Already started more than 2 min ago — skip
    if (minutesUntil < -2) continue;

    // Get users to notify: assignee + participants + creator
    const uids = [];
    if (task.assigneeId) uids.push(task.assigneeId);
    if (Array.isArray(task.agendaMeta.participantIds)) uids.push(...task.agendaMeta.participantIds);
    if (task.createdBy && !uids.includes(task.createdBy)) uids.push(task.createdBy);
    const uniqueUids = [...new Set(uids)];

    const h12 = formatHour12(startHour);

    // Check each threshold independently
    const thresholds = [];

    // 30-minute advance reminder
    if (minutesUntil > 10 && minutesUntil <= 35) {
      thresholds.push({ min: minutesUntil, label: 30 });
    }

    // 10-minute reminder
    if (minutesUntil > 3 && minutesUntil <= 15) {
      thresholds.push({ min: minutesUntil, label: 10 });
    }

    // 5-minute urgent reminder
    if (minutesUntil > 0 && minutesUntil <= 8) {
      thresholds.push({ min: minutesUntil, label: 5 });
    }

    // Starting now: within 0-2 min
    if (minutesUntil >= -2 && minutesUntil <= 0) {
      thresholds.push({ min: 0, label: 0 });
    }

    for (const { min: mins, label: threshold } of thresholds) {
      const dedupKey = `agendaStart-${task.id}-${today}-${threshold}min`;

      if (await wasRecentlyNotified(db, dedupKey, 2)) {
        skipped++;
        continue;
      }

      for (const uid of uniqueUids) {
        let title, body, waPrefix, emailSubject;

        if (threshold === 0) {
          title = `🚀 ¡Tu actividad empieza ahora: ${task.title}`;
          body = `"${task.title}" a las ${h12}${task.priority ? ` · Prioridad: ${task.priority}` : ''}`;
          waPrefix = '🚀 ¡EMPIEZA AHORA!';
          emailSubject = `🚀 Actividad empieza ahora: ${task.title}`;
        } else if (threshold <= 5) {
          title = `🔴 ¡Actividad en ${Math.round(mins)} min: ${task.title}`;
          body = `"${task.title}" a las ${h12}${task.priority ? ` · Prioridad: ${task.priority}` : ''}`;
          waPrefix = `🔴 ¡EMPIEZA EN ${Math.round(mins)} MIN!`;
          emailSubject = `🔴 Actividad en ${Math.round(mins)} min: ${task.title}`;
        } else if (threshold <= 10) {
          title = `⏰ Actividad en ~${Math.round(mins)} min: ${task.title}`;
          body = `"${task.title}" a las ${h12}${task.priority ? ` · Prioridad: ${task.priority}` : ''}`;
          waPrefix = '⏰ Recordatorio: actividad pronto';
          emailSubject = `⏰ Actividad en ~${Math.round(mins)} min: ${task.title}`;
        } else {
          title = `📋 Actividad en ~${Math.round(mins)} min: ${task.title}`;
          body = `"${task.title}" a las ${h12}${task.priority ? ` · Prioridad: ${task.priority}` : ''}`;
          waPrefix = '📋 Recordatorio de agenda';
          emailSubject = `📋 Actividad en ~${Math.round(mins)} min: ${task.title}`;
        }

        // Push
        const pushOk = await sendPushToUser(db, uid, title, body, {
          screen: 'weeklyAgenda',
          type: 'agenda',
          itemId: task.id,
        });

        // WhatsApp
        const waOk = await sendWhatsAppToUser(db, uid,
          `${waPrefix}\n\n` +
          `📋 *${task.title}*\n` +
          `🕐 ${h12}\n` +
          `${task.priority ? `📌 Prioridad: ${task.priority}\n` : ''}` +
          `\n_Abre Archii para ver tu agenda._`
        );

        // Email — get user email from Firestore
        try {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData?.email) {
              const emailHtml = `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
                  <div style="background:linear-gradient(135deg,#312e81,#581c87);border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">🏗️ Archii</h1>
                  </div>
                  <div style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                    <h2 style="margin:0 0 16px;font-size:20px;color:#1f2937;">${threshold === 0 ? '🚀 ¡Tu actividad empieza ahora!' : `⏰ Actividad en ~${Math.round(mins)} minutos`}</h2>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;"><span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Actividad</span><br><span style="font-size:15px;color:#1f2937;font-weight:600;">${task.title}</span></td></tr>
                      <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;"><span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Hora de inicio</span><br><span style="font-size:15px;color:#4f46e5;font-weight:600;">${h12}</span></td></tr>
                      <tr><td style="padding:10px 0;"><span style="font-size:12px;color:#6b7280;text-transform:uppercase;">Tiempo restante</span><br><span style="font-size:15px;color:${threshold <= 5 ? '#dc2626' : '#4f46e5'};font-weight:600;">${threshold === 0 ? '¡Ahora mismo!' : `${Math.round(mins)} minutos`}</span></td></tr>
                    </table>
                  </div>
                  <div style="background:#fff;border-radius:0 0 12px 12px;padding:20px 32px;border:1px solid #e5e7eb;border-top:none;text-align:center;">
                    <a href="https://archii-theta.vercel.app" style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">Abrir Archii</a>
                  </div>
                </div>`;

              await sendEmailToUser(userData.email, emailSubject, emailHtml);
            }
          }
        } catch (err) {
          console.warn(`[Archii Cron] Email failed for ${uid}:`, err.message?.substring(0, 80));
        }

        console.log(`[Archii Cron] ✓ Notified user ${uid} about "${task.title}" (${threshold === 0 ? 'now' : `~${Math.round(mins)}min`}) — Push:${pushOk ? '✓' : '✗'} WA:${waOk ? '✓' : '✗'}`);
      }

      await markNotified(db, dedupKey);
      sent++;
    }
  }

  return { sent, skipped };
}

// ═══════════════════════════════════════════════════════════════
//  DAILY AGENDA SUMMARY (7am Colombia)
// ═══════════════════════════════════════════════════════════════

async function checkDailyAgendaReminder() {
  const db = getDb();
  const today = todayColombia();
  const currentHour = colombiaHour();

  // Only send at 7am
  if (currentHour !== 7) {
    return { sent: 0, skipped: 0 };
  }

  const dedupKey = `dailyAgenda-${today}`;
  if (await wasRecentlyNotified(db, dedupKey, 12)) return { sent: 0, skipped: 1 };

  const snap = await db.collection('tasks')
    .where('status', '!=', 'Completado')
    .get();

  const todayTasks = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t =>
      t.agendaMeta?.dayKey === today &&
      t.agendaMeta?.hourSlots &&
      t.agendaMeta.hourSlots.length > 0
    );

  if (todayTasks.length === 0) return { sent: 0, skipped: 0 };

  // Group by user
  const userTasks = {};
  for (const task of todayTasks) {
    const uids = [...(task.agendaMeta?.participantIds || [])];
    if (task.assigneeId) uids.push(task.assigneeId);
    if (task.createdBy) uids.push(task.createdBy);
    for (const uid of [...new Set(uids)]) {
      if (!userTasks[uid]) userTasks[uid] = [];
      userTasks[uid].push(task);
    }
  }

  let sent = 0;
  for (const [uid, tasks] of Object.entries(userTasks)) {
    const taskList = tasks
      .sort((a, b) => {
        const aMin = a.agendaMeta?.hourSlots?.length ? Math.min(...a.agendaMeta.hourSlots) : 99;
        const bMin = b.agendaMeta?.hourSlots?.length ? Math.min(...b.agendaMeta.hourSlots) : 99;
        return aMin - bMin;
      })
      .map((t, i) => {
        const hours = t.agendaMeta?.hourSlots || [];
        const hourStr = hours.length > 0 ? `${Math.min(...hours)}:00` : '';
        return `${i + 1}. ${hourStr ? `(${hourStr}) ` : ''}${t.title}`;
      })
      .join('\n');

    const title = `📆 Tu agenda de hoy`;
    const body = `Tienes ${tasks.length} actividad${tasks.length > 1 ? 'es' : ''} programada${tasks.length > 1 ? 's' : ''} hoy`;

    // Push
    await sendPushToUser(db, uid, title, body, { screen: 'weeklyAgenda', type: 'agenda' });

    // WhatsApp
    await sendWhatsAppToUser(db, uid, `${title}\n\n${taskList}\n\n_Abre Archii para ver tu agenda._`);

    console.log(`[Archii Cron] ✓ Daily agenda summary sent to ${uid} (${tasks.length} activities)`);
    sent++;
  }

  await markNotified(db, dedupKey);
  return { sent, skipped: 0 };
}

// ═══════════════════════════════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════════════════════════════

async function cleanupOldNotifications() {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const snap = await db.collection('cronNotifLog')
    .where('sentAt', '<', sevenDaysAgo)
    .limit(500)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`[Archii Cron] Cleaned up ${snap.size} old notification log entries.`);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n[Archii Cron] === Agenda Notifications — ${new Date().toISOString()} ===`);

  // Check for --type flag
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf('--type');
  const forceType = typeIdx >= 0 ? args[typeIdx + 1] : null; // 'hourly' | 'daily' | 'all'

  try {
    const results = {};

    // Agenda starting reminders (every 5 min)
    if (!forceType || forceType === 'hourly' || forceType === 'all') {
      try {
        results.agendaStartingReminders = await checkAgendaStartingReminders();
      } catch (err) {
        console.error('[Archii Cron] agendaStartingReminders error:', err.message);
        results.agendaStartingReminders = { error: err.message };
      }
    }

    // Daily agenda summary (7am)
    if (!forceType || forceType === 'daily' || forceType === 'all') {
      try {
        results.dailyAgendaReminder = await checkDailyAgendaReminder();
      } catch (err) {
        console.error('[Archii Cron] dailyAgendaReminder error:', err.message);
        results.dailyAgendaReminder = { error: err.message };
      }
    }

    // Cleanup
    try {
      await cleanupOldNotifications();
    } catch (err) {
      console.error('[Archii Cron] cleanup error:', err.message);
    }

    console.log(`\n[Archii Cron] Results:`, JSON.stringify(results, null, 2));
    console.log(`[Archii Cron] === Done ===\n`);

    process.exit(0);
  } catch (err) {
    console.error('[Archii Cron] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
