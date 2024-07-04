const socket = io();
const connectButton = document.getElementById('connectButton');
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
let isConnected = false;  // Bağlantı durumunu izlemek için

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

    ports.push(port);
    readers.push(reader);
    writers.push(writer);

    console.log(`Connected to port ${ports.length}`);
    isConnected = true;  // Bağlantı durumunu güncelle
    pairedStatus.style.display = 'inline';  // Bağlandığında "Paired" yazısını göster

    readPort(reader);
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    isConnected = false;  // Bağlantı başarısız olursa durumu güncelle
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

async function readPort(reader) {
  let buffer = new Uint8Array();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      console.log('Serial port reading finished');
      break;
    }
    if (value) {
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
    }

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf(10)) !== -1) {
      const completeMessage = new TextDecoder().decode(buffer.slice(0, newlineIndex)).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (completeMessage) {
        console.log(`Data received: ${completeMessage}`);

        // Tüm portlara mesajı gönderiyoruz
        socket.emit('message', { message: completeMessage });
        displayMessage(completeMessage, 'received'); // Mesajı alıcı portta da göster
      }
    }
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

  // Mesaj sadece gönderen porttan ise 'messageList' kısmına ekleyelim
  if (type === 'sent') {
    allMessages.push(message); // Mesajı listeye ekle
    const messageList = document.getElementById('messageList');
    const messageListItem = document.createElement('div');
    messageListItem.classList.add('message-item');

    // Mesaj numarasını ekleyelim
    const messageNumber = document.createElement('div');
    messageNumber.classList.add('message-number');
    messageNumber.innerText = ++messageCount; // Mesaj numarasını artırarak ekleyelim
    messageListItem.appendChild(messageNumber);

    const messageText = document.createElement('div');
    messageText.classList.add('message-text');
    messageText.innerText = message;
    messageListItem.appendChild(messageText);

    // Pin butonu ekleyelim
    const pinButton = document.createElement('button');
    pinButton.classList.add('pin-button');
    pinButton.innerText = '📌';
    pinButton.addEventListener('click', () => togglePinMessage(messageListItem));
    messageListItem.appendChild(pinButton);

    // Silme butonu ekleyelim
    const deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-button');
    deleteButton.innerText = '🗑️';
    deleteButton.addEventListener('click', () => deleteMessage(messageListItem, message));
    messageListItem.appendChild(deleteButton);

    // Yeniden gönderme butonu ekleyelim
    const resendButton = document.createElement('button');
    resendButton.classList.add('resend-button');
    resendButton.innerText = '🔄';
    resendButton.addEventListener('click', () => resendMessage(message));
    messageListItem.appendChild(resendButton);

    // En son gelen mesajın en üste gelmesi için prepend kullanıyoruz
    messageList.prepend(messageListItem);
  }
}

function deleteMessage(messageItem, message) {
  const messageList = document.getElementById('messageList');
  messageList.removeChild(messageItem);
  pinnedMessages = pinnedMessages.filter(item => item !== messageItem);
  allMessages = allMessages.filter(msg => msg !== message); // Mesajı listeden çıkar
}

function togglePinMessage(messageItem) {
  const messageList = document.getElementById('messageList');
  if (messageItem.classList.contains('pinned-message')) {
    // Unpin
    messageItem.classList.remove('pinned-message');
    pinnedMessages = pinnedMessages.filter(item => item !== messageItem);
    
    // Unpin yapıldıktan sonra mesajı doğru konuma yerleştir
    messageList.removeChild(messageItem);
    
    // Pinned mesajlar üstte kalacak şekilde sıralayalım
    const unpinnedMessages = Array.from(messageList.children);
    unpinnedMessages.push(messageItem);
    unpinnedMessages.sort((a, b) => {
      const aNumber = parseInt(a.querySelector('.message-number').innerText, 10);
      const bNumber = parseInt(b.querySelector('.message-number').innerText, 10);
      return bNumber - aNumber; // Büyükten küçüğe sıralama
    });
    
    // Pinned mesajları tekrar ekleyelim
    pinnedMessages.forEach(pinnedMessage => {
      messageList.prepend(pinnedMessage);
    });

    // Unpinned mesajları sıralanmış şekilde ekleyelim
    unpinnedMessages.forEach(msg => {
      if (!msg.classList.contains('pinned-message')) {
        messageList.appendChild(msg);
      }
    });
  } else {
    // Pin
    messageItem.classList.add('pinned-message');
    pinnedMessages.unshift(messageItem);
    messageList.prepend(messageItem);
  }
}

function resendMessage(message) {
  sendMessage(message);
}

socket.on('message', ({ message }) => {
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

async function sendMessage(message) {
  if (!baudRate || !isConnected) {  // Baud rate ve bağlantı durumu kontrolü
    alert('Please set the baud rate and connect to a serial port before sending a message.');
    return;
  }

  const data = new TextEncoder().encode(message + '\n');
  try {
    for (let i = 0; i < writers.length; i++) {
      await writers[i].write(data);
      console.log(`Message sent from Port${i + 1}: ${message}`);
      displayMessage(message, 'sent'); // Gönderilen mesajın port ID'sini ekliyoruz
    }
    // Gönderici portu dışında tüm portlara mesajı gönderiyoruz
    socket.emit('message', { message });
  } catch (error) {
    console.error('Error sending message:', error);
  }
}
