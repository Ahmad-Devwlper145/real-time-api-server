// proxy-server.js
const WebSocket = require('ws');
const http = require('http');
const dotenv = require('dotenv');
dotenv.config()
// Replace with your actual OpenAI API key
const OPENAI_API_KEY = process.env.TOKEN;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({
    server,
    path: '/realtime'
});

console.log('🚀 Starting OpenAI Realtime Proxy Server...');

wss.on('connection', (clientSocket, request) => {
    console.log('📱 Client connected from:', request.connection.remoteAddress);

    let openaiSocket = null;

    try {
        // Connect to OpenAI with proper authentication
        console.log('🔌 Connecting to OpenAI Realtime API...');

        openaiSocket = new WebSocket(OPENAI_REALTIME_URL, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });

        // OpenAI connection opened
        openaiSocket.on('open', () => {
            console.log('✅ Connected to OpenAI Realtime API');
        });

        // Forward messages from client to OpenAI
        clientSocket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📤 Client → OpenAI:', message.type);

                if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
                    openaiSocket.send(data);
                } else {
                    console.log('⚠️ OpenAI socket not ready, message queued');
                }
            } catch (error) {
                console.error('❌ Error forwarding client message:', error);
            }
        });

        // Forward messages from OpenAI to client
        openaiSocket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📥 OpenAI → Client:', message.type);

                if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(data);
                }
            } catch (error) {
                console.error('❌ Error forwarding OpenAI message:', error);
            }
        });

        // Handle OpenAI connection errors
        openaiSocket.on('error', (error) => {
            console.error('❌ OpenAI WebSocket error:', error);

            // Send error to client
            if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
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

        // Handle OpenAI connection close
        openaiSocket.on('close', (code, reason) => {
            console.log('🔌 OpenAI connection closed:', code, reason.toString());

            if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.close(1000, 'OpenAI connection closed');
            }
        });

    } catch (error) {
        console.error('❌ Failed to create OpenAI connection:', error);

        if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
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

    // Handle client disconnection
    clientSocket.on('close', (code, reason) => {
        console.log('📱 Client disconnected:', code, reason.toString());

        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
            openaiSocket.close();
        }
    });

    // Handle client errors
    clientSocket.on('error', (error) => {
        console.error('❌ Client WebSocket error:', error);

        if (openaiSocket && openaiSocket.readyState === WebSocket.OPEN) {
            openaiSocket.close();
        }
    });
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error);
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 Proxy server running on port ${PORT}`);
    console.log(`📱 React Native should connect to: ws://localhost:${PORT}/realtime`);
    console.log('🔑 Make sure to set your OpenAI API key in the OPENAI_API_KEY variable');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server shut down gracefully');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down server...');
    server.close(() => {
        console.log('✅ Server shut down gracefully');
        process.exit(0);
    });
});