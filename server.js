const app = require('./api/index');
const os = require('os');

const PORT = process.env.PORT || 3000;

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const SERVER_IP = getLocalIpAddress();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
===================================================================
🚀 K-PHOTOBOOTH STUDIO BACKEND SERVER STARTED
===================================================================
💻 Local URL    : http://localhost:${PORT}
📱 Network LAN : http://${SERVER_IP}:${PORT} (Mobile QR scanning)
===================================================================
    `);
});
