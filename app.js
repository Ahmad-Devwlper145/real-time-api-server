// proxy-server.js
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const OPENAI_API_KEY = process.env.TOKEN;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

const server = http.createServer();
const wss = new WebSocket.Server({ server, path: '/realtime' });

console.log('Proxy server starting...');

wss.on('connection', (clientSocket, req) => {
  console.log('Client connected from', req.socket.remoteAddress);

  const openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' }
  });

  openaiSocket.on('open', () => console.log('Connected to OpenAI'));

  // Client -> OpenAI
  clientSocket.on('message', (data) => {
    try {
      // data can be a Buffer or string
      const asStr = data.toString();
      // Attempt to parse JSON for logging; if fails, still forward raw
      let parsed = null;
      try { parsed = JSON.parse(asStr); } catch(e) {}
      if (parsed && parsed.type === 'input_audio_buffer.append') {
        const audioLen = parsed.audio ? parsed.audio.length : 0;
        console.log(`Forwarding input_audio_buffer.append — base64 length: ${audioLen}`);
      } else if (parsed) {
        console.log('Forwarding message type:', parsed.type);
      }

      if (openaiSocket.readyState === WebSocket.OPEN) {
        openaiSocket.send(asStr);
      } else {
        console.warn('OpenAI socket not open — dropping or queueing message');
      }
    } catch (err) {
      console.error('Error forwarding client -> OpenAI', err);
    }
  });

  // OpenAI -> Client
  openaiSocket.on('message', (data) => {
    try {
      const str = data.toString();
      // Parse to log important error details
      let parsed = null;
      try { parsed = JSON.parse(str); } catch (e) {}
      if (parsed && parsed.type === 'error') {
        console.error('OpenAI returned error:', JSON.stringify(parsed.error));
        // forward the error to client as well
      } else if (parsed) {
        console.log('OpenAI -> client:', parsed.type);
      } else {
        console.log('OpenAI sent non-JSON message');
      }

      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(str);
      }
    } catch (err) {
      console.error('Error forwarding OpenAI -> client', err);
    }
  });

  openaiSocket.on('close', (code, reason) => {
    console.log('OpenAI socket closed', code, reason && reason.toString());
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.close(1000, 'OpenAI closed');
  });

  openaiSocket.on('error', (err) => {
    console.error('OpenAI socket error', err);
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(JSON.stringify({ type: 'error', error: { message: 'OpenAI connection error', details: String(err) } }));
    }
  });

  clientSocket.on('close', (code, reason) => {
    console.log('Client closed', code, reason && reason.toString());
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });

  clientSocket.on('error', (err) => {
    console.error('Client socket error', err);
    if (openaiSocket.readyState === WebSocket.OPEN) openaiSocket.close();
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('Proxy listening on port', PORT));
