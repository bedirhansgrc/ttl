const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let allMessages = []; 
let connectedBaudRates = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('setBaudRate', (baudRate) => {
    connectedBaudRates[socket.id] = baudRate;

    const uniqueBaudRates = new Set(Object.values(connectedBaudRates));
    if (uniqueBaudRates.size > 1) {
      console.log('Baud rates do not match across all connected ports. Disconnecting all clients.');
      io.emit('disconnectAll', 'Baud rates do not match across all connected ports.');
      connectedBaudRates = {};
      allMessages = [];
    }
  });

  socket.on('message', (message) => {
    console.log('Message received:', message);

    const senderBaudRate = connectedBaudRates[socket.id];
    const uniqueBaudRates = new Set(Object.values(connectedBaudRates));

    if (uniqueBaudRates.size > 1) {
      console.log('Baud rates do not match across all connected ports. Disconnecting all clients.');
      io.emit('disconnectAll', 'Baud rates do not match across all connected ports.');
      connectedBaudRates = {};
      allMessages = [];
      return;
    }

    if (allMessages.includes(message.message)) {
      console.log(`Message '${message.message}' already received, not processing again.`);
      return;
    }

    allMessages.push(message.message);
    socket.broadcast.emit('message', message);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    delete connectedBaudRates[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
