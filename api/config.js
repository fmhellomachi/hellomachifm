module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Define defaults
  const defaults = {
    "stream_url": "https://hellomachifm.duckdns.org/listen/hello_machi_fm/radio.mp3",
    "fallback_stream_url": "https://sonic-ca.instainternet.com/8022/stream",
    "hls_stream_url": "https://hellomachifm.duckdns.org/hls/hello_machi_fm/live.m3u8",
    "latest_version_code": 27033,
    "latest_version_name": "27.33",
    "apk_url": "https://github.com/fmhellomachi/hello-machi-backend/releases/download/V27.33/app-universal-release.apk",
    "update_message": "New update available! Tap to download the latest Hello Machi FM.",
    "whatsapp_number": "+91 9092363433",
    "whatsapp_message": "Hello Machi FM! 🎵",
    "facebook_url": "https://www.facebook.com/hellomachifm",
    "instagram_url": "https://www.instagram.com/hellomachifm",
    "youtube_url": "https://www.youtube.com/@hellomachifm",
    "custom_link": "https://hellomachifm.vercel.app/api/config",
    "logo_url": "https://hellomachifm.vercel.app/logo.jpg",
    "accent_color": "#D4AF37",
    "request_song_message": "I'd like to request a song 🎵",
    "welcome_title": "HELLO MACHI FM",
    "welcome_greeting": "இது நம்ம ஏரியா மச்சி",
    "status_message": "Synced via Vercel Cloud",
    "programs": [
      { "time": "06:00", "endTime": "09:00", "title": "Morning Vibes", "rj": "RJ Malar" },
      { "time": "09:00", "endTime": "12:00", "title": "Retro Hits", "rj": "RJ Uthiran" },
      { "time": "12:00", "endTime": "16:00", "title": "Midday Melodies", "rj": "RJ Malar" },
      { "time": "16:00", "endTime": "20:00", "title": "Evening Express", "rj": "RJ Vijay" },
      { "time": "20:00", "endTime": "23:59", "title": "Romantic Night", "rj": "RJ Uthiran" },
      { "time": "00:00", "endTime": "06:00", "title": "Iravin Madiyil", "rj": "RJ Vijay" }
    ]
  };

  try {
    const configUrl = 'https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents/cms/config';
    const configRes = await fetch(configUrl);
    let flatConfig = {};

    if (configRes.ok) {
      const doc = await configRes.json();
      if (doc.fields) {
        flatConfig = flattenFirestoreFields(doc.fields);
      }
    }

    // Auto-detect latest version from GitHub (used as base, overridable by Firestore)
    let ghValues = {};
    try {
        const ghRes = await fetch('https://api.github.com/repos/fmhellomachi/hello-machi-backend/releases/latest');
        if (ghRes.ok) {
            const ghData = await ghRes.json();
            const tag = ghData.tag_name || '';
            const match = tag.match(/(\d+)\.(\d+)/);
            if (match) {
                const ghVersion = parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
                ghValues = {
                    latest_version_code: ghVersion,
                    latest_version_name: tag.replace(/^v/, ''),
                    apk_url: `https://github.com/fmhellomachi/hello-machi-backend/releases/download/${tag}/app-universal-release.apk`
                };
            }
        }
    } catch (ghErr) {
        console.error("GitHub release fetch error (non-fatal):", ghErr);
    }

    // Merge: defaults → Firestore → GitHub (GitHub auto-detect wins for version/apk)
    // This prevents stale admin saves from overriding the actual latest release
    let finalConfig = { ...defaults, ...flatConfig, ...ghValues };

    // If programs is empty/missing, fallback to scheduleBlocks from homepage
    if (!finalConfig.programs || finalConfig.programs.length === 0) {
      try {
        const hpUrl = 'https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents/cms/homepage';
        const hpRes = await fetch(hpUrl);
        if (hpRes.ok) {
          const hpDoc = await hpRes.json();
          if (hpDoc.fields) {
            const hpData = flattenFirestoreFields(hpDoc.fields);
            if (hpData.scheduleBlocks && hpData.scheduleBlocks.length > 0) {
              finalConfig.programs = hpData.scheduleBlocks.map(b => ({
                time: b.time,
                endTime: b.endTime,
                title: b.title,
                rj: b.rj || ''
              }));
              finalConfig.scheduleBlocks = hpData.scheduleBlocks;
            }
          }
        }
      } catch (hpErr) {
        console.error("Homepage fallback fetch error:", hpErr);
      }
    }

    res.status(200).json(finalConfig);

  } catch (err) {
    console.error("Config fetch error:", err);
    res.status(200).json(defaults);
  }
};

function flattenFirestoreFields(fields) {
  const result = {};
  if (!fields) return result;
  for (const [key, value] of Object.entries(fields)) {
    if (value.hasOwnProperty('stringValue')) {
      result[key] = value.stringValue;
    } else if (value.hasOwnProperty('integerValue')) {
      result[key] = parseInt(value.integerValue, 10);
    } else if (value.hasOwnProperty('doubleValue')) {
      result[key] = parseFloat(value.doubleValue);
    } else if (value.hasOwnProperty('booleanValue')) {
      result[key] = value.booleanValue;
    } else if (value.hasOwnProperty('arrayValue')) {
      const arr = value.arrayValue.values || [];
      result[key] = arr.map(item => {
        if (item.hasOwnProperty('mapValue')) {
          return flattenFirestoreFields(item.mapValue.fields);
        } else if (item.hasOwnProperty('stringValue')) {
          return item.stringValue;
        }
        return item;
      });
    } else if (value.hasOwnProperty('mapValue')) {
      result[key] = flattenFirestoreFields(value.mapValue.fields);
    }
  }
  return result;
}
