const socket = io();
const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const portSelect = document.getElementById('portSelect');
const dataDiv = document.getElementById('data');
const baudRateInput = document.getElementById('baudRateInput');
const setBaudRateButton = document.getElementById('setBaudRateButton');
const exportButton = document.getElementById('exportButton');
const pairedStatus = document.getElementById('pairedStatus');
let baudRate;
let ports = [];
let readers = [];
let writers = [];
let messageCount = 0;
let pinnedMessages = [];
let allMessages = [];
let activePorts = {}; // Hangi portların aktif olduğunu izler
let isConnected = false; // Genel bağlantı durumu
let connectedBaudRates = []; // Bağlanan portların baud rate'lerini tutar

document.addEventListener('DOMContentLoaded', (event) => {
  baudRateInput.value = 115200;
});

setBaudRateButton.addEventListener('click', () => {
  const baudRateValue = baudRateInput.value.trim();
  if (baudRateValue) {
    baudRate = parseInt(baudRateValue, 10);
    alert(`Baud rate set to ${baudRate}`);
  } else {
    alert('Please enter baud rate');
  }
});

connectButton.addEventListener('click', async () => {
  if (!baudRate) {
    alert('Please enter baud rate');
    return;
  }

  try {
    console.log('Connecting to serial port...');

    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: baudRate });
    const reader = port.readable.getReader();
    const writer = port.writable.getWriter();

    const portNumber = ports.length;
    ports.push(port);
    readers.push(reader);
    writers.push(writer);
    connectedBaudRates.push(baudRate); // Bağlanan portun baud rate'ini kaydet

    console.log(`Connected to port ${portNumber + 1}`);
    isConnected = true; // Genel bağlantı durumunu güncelle
    pairedStatus.style.display = 'inline'; 
    activePorts[portNumber] = true; // Portu aktif olarak işaretle

    readPort(reader, portNumber);  // Port numarasını readPort fonksiyonuna gönderiyoruz
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    isConnected = false; // Genel bağlantı durumunu güncelle
  }
});

disconnectButton.addEventListener('click', () => {
  if (ports.length > 0) {
    ports.forEach((port, index) => {
      closePort(index);
    });
    alert('All ports disconnected');
    isConnected = false; // Genel bağlantı durumunu güncelle
    pairedStatus.style.display = 'none';
    connectedBaudRates = []; // Bağlanan baud rate'leri sıfırla
  } else {
    alert('No ports to disconnect');
  }
});

exportButton.addEventListener('click', () => {
  if (allMessages.length === 0) {
    alert('No messages to export.');
    return;
  }
  const exportData = allMessages.map((message, index) => ({
    number: index + 1,
    message: message
  }));
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'messages.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

async function readPort(reader, portNumber) {
  let buffer = '';
  activePorts[portNumber] = true;

  while (isConnected && activePorts[portNumber]) { // Genel bağlantı durumunu ve port durumunu kontrol et
    try {
      const { value, done } = await reader.read();
      if (done) {
        console.log(`Serial port ${portNumber + 1} reading finished`);
        delete activePorts[portNumber];
        break;
      }
      if (value) {
        buffer += new TextDecoder().decode(value);
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const completeMessage = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (completeMessage) {
            console.log(`Data received from port ${portNumber + 1}: ${completeMessage}`);
            socket.emit('message', { message: completeMessage, port: portNumber + 1 });
            displayMessage(completeMessage, 'received');
          }
        }
      }
    } catch (error) {
      console.error('Error reading from port:', error);
      break;
    }
  }
}

function closePort(portNumber) {
  if (ports[portNumber]) {
    activePorts[portNumber] = false; // Portu devre dışı bırak
    readers[portNumber].releaseLock();
    writers[portNumber].releaseLock();
    ports[portNumber].close().then(() => {
      console.log(`Port ${portNumber + 1} closed`);
      connectedBaudRates.splice(portNumber, 1); // Bağlanan baud rate'leri güncelle
    }).catch(error => {
      console.error(`Error closing port ${portNumber + 1}:`, error);
    });
  }
}

function displayMessage(message, type = 'received') {
  const messageContainer = document.createElement('div');
  messageContainer.classList.add(type === 'sent' ? 'message-sent' : 'message-received');

  const p = document.createElement('p');
  p.innerText = message;
  messageContainer.appendChild(p);

  const now = new Date();
  const timeString = now.toLocaleTimeString();

  const timeSpan = document.createElement('span');
  timeSpan.innerText = timeString;
  timeSpan.classList.add('message-time');

  messageContainer.appendChild(timeSpan);

  dataDiv.appendChild(messageContainer);
  dataDiv.scrollTop = dataDiv.scrollHeight;

  // Mesaj gönderildiyse ve listede zaten yoksa ekle
  if (type === 'sent') {
    if (!allMessages.includes(message)) {
      allMessages.push(message);
      
      const messageList = document.getElementById('messageList');
      const messageListItem = document.createElement('div');
      messageListItem.classList.add('message-item');

      const messageNumber = document.createElement('div');
      messageNumber.classList.add('message-number');
      messageNumber.innerText = ++messageCount;
      messageListItem.appendChild(messageNumber);

      const messageText = document.createElement('div');
      messageText.classList.add('message-text');
      messageText.innerText = message;
      messageListItem.appendChild(messageText);

      const pinButton = document.createElement('button');
      pinButton.classList.add('pin-button');
      pinButton.innerText = '📌';
      pinButton.addEventListener('click', () => togglePinMessage(messageListItem));
      messageListItem.appendChild(pinButton);

      const deleteButton = document.createElement('button');
      deleteButton.classList.add('delete-button');
      deleteButton.innerText = '🗑️';
      deleteButton.addEventListener('click', () => deleteMessage(messageListItem, message));
      messageListItem.appendChild(deleteButton);

      const resendButton = document.createElement('button');
      resendButton.classList.add('resend-button');
      resendButton.innerText = '🔄';
      resendButton.addEventListener('click', () => resendMessage(message));
      messageListItem.appendChild(resendButton);

      messageList.prepend(messageListItem);
    }
  }
}

function deleteMessage(messageItem, message) {
  const messageList = document.getElementById('messageList');
  messageList.removeChild(messageItem);
  pinnedMessages = pinnedMessages.filter(item => item !== messageItem);
  allMessages = allMessages.filter(msg => msg !== message);
}

function togglePinMessage(messageItem) {
  const messageList = document.getElementById('messageList');
  if (messageItem.classList.contains('pinned-message')) {
    messageItem.classList.remove('pinned-message');
    pinnedMessages = pinnedMessages.filter(item => item !== messageItem);

    messageList.removeChild(messageItem);

    const unpinnedMessages = Array.from(messageList.children);
    unpinnedMessages.push(messageItem);
    unpinnedMessages.sort((a, b) => {
      const aNumber = parseInt(a.querySelector('.message-number').innerText, 10);
      const bNumber = parseInt(b.querySelector('.message-number').innerText, 10);
      return bNumber - aNumber;
    });

    pinnedMessages.forEach(pinnedMessage => {
      messageList.prepend(pinnedMessage);
    });

    unpinnedMessages.forEach(msg => {
      if (!msg.classList.contains('pinned-message')) {
        messageList.appendChild(msg);
      }
    });
  } else {
    messageItem.classList.add('pinned-message');
    pinnedMessages.unshift(messageItem);
    messageList.prepend(messageItem);
  }
}

function resendMessage(message) {
  sendMessage(message);
}

async function sendMessage(message) {
  if (!baudRate || Object.keys(activePorts).length === 0) { 
    alert('Please set the baud rate and connect to a serial port before sending a message.');
    return;
  }

  const uniqueBaudRates = [...new Set(connectedBaudRates)];
  if (uniqueBaudRates.length > 1) {
    alert('Baud rates do not match across all connected ports.');
    return;
  }

  const data = new TextEncoder().encode(message + '\n');
  try {
    for (let i = 0; i < writers.length; i++) {
      if (activePorts[i]) {
        await writers[i].write(data);
        console.log(`Message sent from Port${i + 1}: ${message}`);
        displayMessage(message, 'sent');
      }
    }
    socket.emit('message', { message, port: writers.length });  // Port sayısını da gönderiyoruz
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

socket.on('message', ({ message }) => {
  if (!isConnected) return;  // Genel bağlantı durumu kontrolü
  console.log(`Message received: ${message}`);
  displayMessage(message, 'received');
});

const form = document.getElementById('messageForm');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = document.getElementById('message').value.trim();
  if (message) {
    sendMessage(message);
    document.getElementById('message').value = '';
  }
});
