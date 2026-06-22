const state = require('./_state');

const FIREBASE_API_KEY = 'AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { nickname, recipient, message, title, artist } = req.body || {};

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const now = Date.now();

    // 1. Store in shared in-memory state (instant — same Vercel warm instance)
    state.currentDedication = {
      nickname: nickname || 'A Listener',
      recipient: recipient || '',
      message:   message   || '',
      songTitle: title,
    };
    state.dedicationSetAt = now;

    // 2. Also write to Firestore for cross-instance persistence
    try {
      const fields = {
        nickname:    { stringValue: nickname  || '' },
        recipient:   { stringValue: recipient || '' },
        raw_message: { stringValue: message   || '' },
        dedication:  { stringValue: (recipient ? `To: ${recipient} | Msg: ${message}` : message) || '' },
        title:       { stringValue: title     || '' },
        artist:      { stringValue: artist    || '' },
        timestamp:   { integerValue: String(now) },
      };

      await fetch(`${FIRESTORE_BASE}/requests?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    } catch (fsErr) {
      console.error('Firestore write error (non-fatal):', fsErr);
    }

    res.status(200).json({ ok: true, stored: state.currentDedication });
  } catch (err) {
    console.error('Dedicate endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
};
