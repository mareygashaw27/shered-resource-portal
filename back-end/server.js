const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const systemPort = process.env.PORT;
require('dotenv').config();
const express = require('express');
const http = require('http');
const os = require('os');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDatabase } = require('./config/database');

// Get local network IP for QR code generation
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
const { initCronJobs } = require('./services/cronJobs');

const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const bookingRoutes = require('./routes/bookings');
const approvalRoutes = require('./routes/approvals');
const waitlistRoutes = require('./routes/waitlist');
const reportRoutes = require('./routes/reports');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Attach io to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/reports', reportRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Shared Resource Scheduling System Backend API is running successfully!',
    health: '/api/health',
    timestamp: new Date()
  });
});

// Root health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Shared Resource Scheduling System API', timestamp: new Date() });
});

// Returns the server's local network IP so frontend can build correct QR URLs
app.get('/api/server-ip', (req, res) => {
  res.json({ ip: getLocalIP(), port: process.env.PORT || 5000 });
});

// Socket.io Connection
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Prioritize cloud host environment PORT (e.g. Render port 10000) over local default
const PORT = systemPort || process.env.PORT || 5000;

async function startServer() {
  await initDatabase();
  initCronJobs(io);

  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`=======================================================`);
    console.log(`🚀 Shared Resource Scheduling System Backend Server`);
    console.log(`📡 Localhost:  http://localhost:${PORT}`);
    console.log(`📱 Network:    http://${localIP}:${PORT}  ← use this for QR/mobile`);
    console.log(`=======================================================`);
  });
}

startServer();
