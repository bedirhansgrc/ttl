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

let allMessages = [];  // Tüm mesajların listesini tutmak için bir array

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('message', (message) => {
    console.log('Message received:', message);

    // Mesajın daha önce alınmış olup olmadığını kontrol et
    if (allMessages.includes(message.message)) {
      console.log(`Message '${message.message}' already received, not processing again.`);
      return;
    }

    // Mesajı allMessages listesine ekle
    allMessages.push(message.message);

    // Diğer kullanıcılara yay
    socket.broadcast.emit('message', message);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
