// proxy-server.js
const WebSocket = require('ws');
const http = require('http');
const dotenv = require('dotenv');
dotenv.config()

const OPENAI_API_KEY = process.env.TOKEN;
const OPENAI_REALTIME_URL =
    'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({
    server,
    path: '/realtime'
});

console.log('🚀 Starting OpenAI Realtime Proxy Server...');

wss.on('connection', (clientSocket, request) => {
    console.log('📱 Client connected from:', request.socket.remoteAddress);

    let openaiSocket = null;

    try {
        console.log('🔌 Connecting to OpenAI Realtime API...');

        openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });

        openaiSocket.on('open', () => {
            console.log('✅ Connected to OpenAI Realtime API');
        });

        // Client → OpenAI
        clientSocket.on('message', (data) => {
            try {
                if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
                    openaiSocket.send(data);
                } else {
                    console.log('⚠️ OpenAI socket not ready, message dropped');
                }
            } catch (error) {
                console.error('❌ Error forwarding client message:', error);
            }
        });

        // OpenAI → Client
        openaiSocket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📥 OpenAI → Client:', message.type);
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(JSON.stringify(message));
                }
            } catch (error) {
                console.error('❌ Error parsing OpenAI message:', error);
                console.error('Raw data:', data.toString());
            }
        });

        openaiSocket.on('error', (error) => {
            console.error('❌ OpenAI WebSocket error:', error);
            if (clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.send(JSON.stringify({
                    type: 'error',
                    error: {
                        type: 'connection_error',
                        message: 'Failed to connect to OpenAI API',
                        details: error.message
                    }
                }));
            }
        });

        openaiSocket.on('close', (code, reason) => {
            console.log('🔌 OpenAI connection closed:', code, reason.toString());
            if (clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.close(1000, 'OpenAI connection closed');
            }
        });

    } catch (error) {
        console.error('❌ Failed to create OpenAI connection:', error);
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(JSON.stringify({
                type: 'error',
                error: {
                    type: 'connection_error',
                    message: 'Failed to initialize OpenAI connection',
                    details: error.message
                }
            }));
        }
    }

    clientSocket.on('close', (code, reason) => {
        console.log('📱 Client disconnected:', code, reason.toString());
        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
            openaiSocket.close();
        }
    });

    clientSocket.on('error', (error) => {
        console.error('❌ Client WebSocket error:', error);
        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
            openaiSocket.close();
        }
    });
});

server.on('error', (error) => {
    console.error('❌ Server error:', error);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 Proxy server running on port ${PORT}`);
    console.log(`📡 Clients should connect to: wss://real-time-api-server.onrender.com/realtime`);
});
