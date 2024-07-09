const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { setInterval } = require('timers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let connectedBaudRates = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  let intervalId;

  function generateRandomNumber(index) {
    const randomBinary = Array.from({ length: 14 }, () => (Math.random() > 0.5 ? '1' : '0')).join('');
    return `${index},${randomBinary}`;
  }

  socket.on('startRandomNumbers', () => {
    console.log('Starting to send random numbers');
    let index = 0;
    intervalId = setInterval(() => {
      const randomNumber = generateRandomNumber(index);
      socket.emit('randomNumber', randomNumber);
      index += 1;
    }, 1000);
  });

  socket.on('stopRandomNumbers', () => {
    console.log('Stopping random numbers');
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    if (intervalId) {
      clearInterval(intervalId);
    }
    delete connectedBaudRates[socket.id];
  });

  socket.on('setBaudRate', (baudRate) => {
    connectedBaudRates[socket.id] = baudRate;

    const uniqueBaudRates = new Set(Object.values(connectedBaudRates));
    if (uniqueBaudRates.size > 1) {
      console.log('Baud rates do not match across all connected ports. Disconnecting all clients.');
      io.emit('disconnectAll', 'Baud rates do not match across all connected ports.');
      connectedBaudRates = {};
    }
  });

  socket.on('message', (message) => {
    console.log('Message received:', message);

    const uniqueBaudRates = new Set(Object.values(connectedBaudRates));
    if (uniqueBaudRates.size > 1) {
      console.log('Baud rates do not match across all connected ports. Disconnecting all clients.');
      io.emit('disconnectAll', 'Baud rates do not match across all connected ports.');
      connectedBaudRates = {};
      return;
    }

    socket.broadcast.emit('message', message);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
