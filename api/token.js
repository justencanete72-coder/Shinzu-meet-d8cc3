import { AccessToken } from 'livekit-server-sdk';

// In-memory queue para sa random matching
let matchQueue = [];

export default async function handler(req, res) {
  // CORS Headers para hindi mag-error ang browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, roomName, participantName } = req.body || {};

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  
  const missing = [];
  if (!apiKey) missing.push('LIVEKIT_API_KEY');
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET');
  if (!livekitUrl) missing.push('LIVEKIT_URL');

  if (missing.length > 0) {
    return res.status(500).json({ error: 'Server not configured', missingVariables: missing });
  }

  if (!participantName || typeof participantName !== 'string' || participantName.length > 20) {
    return res.status(400).json({ error: 'Invalid participant name' });
  }

  if (action === 'randomMatch') {
    let assignedRoom;
    if (matchQueue.length > 0) {
      assignedRoom = matchQueue.shift();
    } else {
      assignedRoom = `random-${crypto.randomUUID().slice(0, 8)}`;
      matchQueue.push(assignedRoom);
    }
    return res.status(200).json({ roomName: assignedRoom });
  }

  if (!roomName || typeof roomName !== 'string' || roomName.length > 36) {
    return res.status(400).json({ error: 'Invalid room name' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
      ttl: '1h'
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();
    return res.status(200).json({ token, url: livekitUrl });
  } catch (err) {
    console.error('Token error:', err);
    return res.status(500).json({ error: 'Token generation failed', details: err.message });
  }
    }
