const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const AZURACAST_API = 'https://hellomachifm.duckdns.org/api/station/hello_machi_fm/requests';
    const results = await new Promise((resolve, reject) => {
      https.get(AZURACAST_API, { headers: { Accept: 'application/json' }, timeout: 10000 }, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Failed to parse Azuracast response')); }
        });
      }).on('error', reject);
    });

    const songs = (results || []).map(obj => ({
      requestId: obj.request_id || obj.id || '',
      title: (obj.song?.title || obj.song_title || 'Unknown').trim(),
      artist: (obj.song?.artist || obj.song_artist || '').trim(),
      album: (obj.song?.album || obj.song_album || '').trim(),
      artUrl: obj.song?.art || obj.art_url || ''
    })).filter(s => s.title && s.title !== 'Unknown' && s.requestId);

    const query = (req.query.q || '').toLowerCase().trim();
    const filtered = query.length >= 2
      ? songs.filter(s => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query))
      : songs;

    res.status(200).json({ songs: filtered, total: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
