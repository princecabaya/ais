/**
 * PSU Balabac AIS — Gmail notification sender.
 * Uses the Gmail account that owns this Apps Script.
 * NEVER place a Supabase service-role key, password, or personal email password here.
 *
 * SETUP:
 * 1. Run initializeAISMailer() once. Copy the generated secret from Execution log.
 * 2. Supabase > Edge Functions > Secrets: add AIS_GMAIL_MAILER_KEY (same secret).
 * 3. Run testAISConnection() once, then send yourself a test notification in AIS.
 * 4. Run sendQueuedAISNotifications() manually to confirm a delivery.
 * 5. Run installFiveMinuteTrigger() once to automate.
 */
const AIS_ENDPOINT = 'https://ugtgxsnqiychmmarjciz.supabase.co/functions/v1/gmail-faculty-notifications';

function initializeAISMailer() {
  const properties = PropertiesService.getScriptProperties();
  const existing = properties.getProperty('AIS_MAILER_KEY');
  if (existing) {
    console.log('The connection key already exists. Do not generate a new one unless rotating keys.');
    return;
  }
  const key = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  properties.setProperty('AIS_MAILER_KEY', key);
  console.log('ONE-TIME CONNECTION KEY — copy into Supabase Edge Function Secret AIS_GMAIL_MAILER_KEY:');
  console.log(key);
  console.log('Keep this key private. Do not share it in chat or commit it to GitHub.');
}

function aisRequest(payload) {
  const key = PropertiesService.getScriptProperties().getProperty('AIS_MAILER_KEY');
  if (!key || key.length < 32) throw new Error('Run initializeAISMailer() and configure Supabase first.');
  const response = UrlFetchApp.fetch(AIS_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'x-ais-mailer-key': key },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('AIS connection returned HTTP ' + status +
      (status === 401 ? ' — check the Supabase connection secret.' : ''));
  }
  return JSON.parse(response.getContentText());
}

function testAISConnection() {
  const result = aisRequest({action: 'claim', limit: 1});
  // WARNING: the claim is temporarily reserved for 20 minutes if there is already a queued notice.
  // Do not log recipient addresses or message bodies.
  console.log('Secure AIS connection is working. Messages claimed: ' + (result.items || []).length);
  if ((result.items || []).length) {
    // Return test-claimed message to pending so the normal sender may process it immediately.
    result.items.forEach(function(item) {
      aisRequest({action:'release', id:item.id, token:item.claim_token});
    });
  }
}

function sendQueuedAISNotifications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) {
      console.log('Gmail daily recipient quota has been reached. Pending notices will be retried.');
      return;
    }
    const result = aisRequest({action:'claim', limit:Math.min(quota, 15)});
    const notices = result.items || [];
    let sent = 0, failed = 0;
    for (let i=0; i<notices.length; i++) {
      const n = notices[i];
      let error = null;
      try {
        // Extra check to avoid sending to unexpected recipients.
        if (!/^[^@\s]+@psu\.palawan\.edu\.ph$/i.test(n.recipient)) {
          throw new Error('Recipient does not have a PSU corporate email');
        }
        MailApp.sendEmail({
          to: n.recipient,
          subject: n.subject,
          body: n.body,
          name: 'PSU Balabac AIS Notifications',
        });
        sent++;
      } catch(e) {
        error = String(e && e.message ? e.message : e).slice(0,200);
        failed++;
      }
      try {
        aisRequest({
          action:'ack', id:n.id, token:n.claim_token,
          sent:error===null, error:error
        });
      } catch(ackError) {
        console.error('Could not update delivery status for notification ' + n.id);
      }
    }
    console.log('AIS dispatch completed: ' + sent + ' sent, ' + failed + ' failed.');
  } finally {
    lock.releaseLock();
  }
}

function installFiveMinuteTrigger() {
  const functionName = 'sendQueuedAISNotifications';
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === functionName)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(functionName).timeBased().everyMinutes(5).create();
  console.log('AIS email sender scheduled approximately every 5 minutes.');
}
