const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { requestId, title, artist, nickname, recipient, message } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId is required' });
    if (!title) return res.status(400).json({ error: 'title is required' });

    let azuracastCode = null;
    try {
      const azuracastResult = await new Promise((resolve, reject) => {
        const u = new URL(`https://hellomachifm.duckdns.org/api/station/1/request/${requestId}`);
        const postData = JSON.stringify({});
        const options = {
          hostname: u.hostname,
          path: u.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
          timeout: 8000
        };
        const reqHttps = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve({ code: resp.statusCode, body: data }));
        });
        reqHttps.on('error', reject);
        reqHttps.write(postData);
        reqHttps.end();
      });
      azuracastCode = azuracastResult.code;
    } catch (azErr) {
      console.error('AzuraCast submit failed:', azErr.message);
    }

    const from = (nickname || '').trim() || 'A Listener';
    const to = (recipient || '').trim() || 'Loved One';
    const dedMsg = (message || '').trim();

    try {
      const firestorePayload = JSON.stringify({
        fields: {
          nickname:     { stringValue: from },
          title:        { stringValue: title },
          artist:       { stringValue: artist || 'Machi FM Artist' },
          dedication:   { stringValue: dedMsg ? `From: ${from} To: ${to} Msg: ${dedMsg}` : `From: ${from} To: ${to}` },
          recipient:    { stringValue: to },
          raw_message:  { stringValue: dedMsg || '' },
          timestamp:    { integerValue: Date.now() },
          source:       { stringValue: 'web' }
        }
      });
      await new Promise((resolve, reject) => {
        const fbUrl = new URL('https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents/requests?key=AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4');
        const options = {
          hostname: fbUrl.hostname,
          path: fbUrl.pathname + fbUrl.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(firestorePayload) },
          timeout: 8000
        };
        const fbReq = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve({ code: resp.statusCode, body: data }));
        });
        fbReq.on('error', reject);
        fbReq.write(firestorePayload);
        fbReq.end();
      });
    } catch (fbErr) {
      console.error('Firestore log failed:', fbErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Dedication submitted successfully! It will play on air soon.',
      azuracast_status: azuracastCode || 'skipped'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
