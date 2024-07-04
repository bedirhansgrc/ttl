const socket = io();
const connectButton = document.getElementById('connectButton');
const dataDiv = document.getElementById('data');
const baudRateInput = document.getElementById('baudRateInput');
const setBaudRateButton = document.getElementById('setBaudRateButton');
let baudRate;
let ports = [];
let readers = [];
let writers = [];
let messageCount = 0;
let pinnedMessages = [];

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

    readPort(reader, ports.length);
  } catch (error) {
    console.error('Error connecting to serial port:', error);
  }
});

async function readPort(reader, portId) {
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
        console.log(`Data received on Port${portId}: ${completeMessage}`);

        // Tüm portlara mesajı gönderiyoruz
        socket.emit('message', { message: completeMessage, portId: `Port${portId}` });
        displayMessage(completeMessage, `Port${portId}`, 'received'); // Mesajı alıcı portta da göster
      }
    }
  }
}

function displayMessage(message, portId, type = 'received') {
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

  // Message list container'a da ekleyelim
  const messageList = document.getElementById('messageList');
  const messageListItem = document.createElement('div');
  messageListItem.classList.add('message-item');

  // Port ID ekleyelim
  const messagePort = document.createElement('div');
  messagePort.classList.add('message-port');
  messagePort.innerText = portId; // Port ID ekleyelim
  messageListItem.appendChild(messagePort);

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

  // En son gelen mesajın en üste gelmesi için prepend kullanıyoruz
  messageList.prepend(messageListItem);
}

function togglePinMessage(messageItem) {
  const messageList = document.getElementById('messageList');
  if (messageItem.classList.contains('pinned-message')) {
    // Unpin
    messageItem.classList.remove('pinned-message');
    pinnedMessages = pinnedMessages.filter(item => item !== messageItem);
    messageList.appendChild(messageItem); // Unpinned mesajı listenin sonuna taşı
  } else {
    // Pin
    messageItem.classList.add('pinned-message');
    pinnedMessages.unshift(messageItem);
    pinnedMessages.forEach(pinnedMessage => {
      messageList.prepend(pinnedMessage);
    });
  }
}

socket.on('message', ({ message, portId }) => {
  console.log(`Message received on Port${portId}: ${message}`);
  displayMessage(message, portId, 'received');
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
  const data = new TextEncoder().encode(message + '\n');
  try {
    const senderPortId = `Port${writers.length}`; // Gönderici port ID'si
    for (let i = 0; i < writers.length; i++) {
      await writers[i].write(data);
      console.log(`Message sent from Port${i + 1}: ${message}`);
      if (`Port${i + 1}` === senderPortId) {
        displayMessage(message, `Port${i + 1}`, 'sent'); // Gönderilen mesajın port ID'sini ekliyoruz
      }
    }
    // Gönderici portu dışında tüm portlara mesajı gönderiyoruz
    socket.emit('message', { message, portId: senderPortId });
  } catch (error) {
    console.error('Error sending message:', error);
  }
}
