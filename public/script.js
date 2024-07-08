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
let activePorts = {};
let isConnected = false;
let connectedBaudRates = [];
let emulatorInterval;
let portIds = [];

setBaudRateButton.addEventListener('click', () => {
  const baudRateValue = baudRateInput.value.trim();
  if (baudRateValue) {
    baudRate = parseInt(baudRateValue, 10);
    alert(`Baud rate set to ${baudRate}`);
    socket.emit('setBaudRate', baudRate);
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

    const portId = generateUniquePortId();
    ports.push(port);
    readers.push(reader);
    writers.push(writer);
    portIds.push(portId);

    if (connectedBaudRates.length > 0 && !connectedBaudRates.includes(baudRate)) {
      console.log('Baud rates do not match. Disconnecting port.');
      alert('Connected baud rates do not match. Disconnecting port.');
      await closePort(portIds.length - 1);
      return;
    }

    connectedBaudRates.push(baudRate);

    console.log(`Connected to port ${portId} with baud rate ${baudRate}`);
    isConnected = true;
    pairedStatus.style.display = 'inline';
    activePorts[portId] = true;

    readPort(reader, portId);

    // Rastgele sayı göndermeyi başlat
    socket.emit('startRandomNumbers');
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    isConnected = false;
  }
});

function generateUniquePortId() {
  return 'port-' + (portIds.length + 1);
}

disconnectButton.addEventListener('click', () => {
  if (ports.length > 0) {
    ports.forEach((port, index) => {
      closePort(index);
    });
    alert('All ports disconnected');
    isConnected = false;
    pairedStatus.style.display = 'none';
    connectedBaudRates = [];
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
  const decoder = new TextDecoder('utf-8');
  activePorts[portNumber] = true;

  while (isConnected && activePorts[portNumber]) {
    try {
      const { value, done } = await reader.read();
      if (done) {
        console.log(`Serial port ${portNumber + 1} reading finished`);
        delete activePorts[portNumber];
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const completeMessage = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (completeMessage) {
            const uniqueBaudRates = [...new Set(connectedBaudRates)];
            if (uniqueBaudRates.length > 1) {
              console.log('Baud rates do not match. Disconnecting all ports.');
              alert('Baud rates do not match across all connected ports. Disconnecting all ports.');
              disconnectAllPorts();
              return;
            }
            console.log(`Data received from port ${portNumber + 1}: ${completeMessage}`);
            socket.emit('message', { message: completeMessage, port: portNumber + 1, baudRate: baudRate });
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

function disconnectAllPorts() {
  ports.forEach((port, index) => {
    closePort(index);
  });
  console.log('All ports disconnected due to mismatched baud rates.');
  alert('All ports disconnected due to mismatched baud rates.');
  isConnected = false;
  pairedStatus.style.display = 'none';
  connectedBaudRates = [];
}

function closePort(portNumber) {
  if (ports[portNumber]) {
    activePorts[portNumber] = false;
    readers[portNumber].releaseLock();
    writers[portNumber].releaseLock();
    ports[portNumber].close().then(() => {
      console.log(`Port ${portNumber + 1} closed`);
      connectedBaudRates.splice(portNumber, 1);
    }).catch(error => {
      console.error(`Error closing port ${portNumber + 1}:`, error);
    });
  }
}

function displayMessage(message, type = 'received') {
  message = message.replace(/[\[\]]/g, ''); // Köşeli parantezleri temizle

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

  // Gönderilen mesajların waveform display'de görünmesini sağla
  if (type === 'sent' && /^[01]+$/.test(message)) {
    updateWaveformDisplay(message, binaryToAscii(message));
  }

  // Sadece gönderilen mesajları message list'e ekle
  if (type === 'sent' && !allMessages.includes(message)) {
    addToMessageList(message, type);
    allMessages.push(message);
  }
}




function addToMessageList(message, type) {
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

function binaryToAscii(binaryStr) {
  let asciiStr = '';
  for (let i = 0; i < binaryStr.length; i += 8) {
    let byte = binaryStr.slice(i, i + 8);
    let charCode = parseInt(byte, 2);
    asciiStr += String.fromCharCode(charCode);
  }
  return asciiStr;
}

async function sendMessage(message, isPortMessage = false) {
  if (!baudRate || Object.keys(activePorts).length === 0) {
    alert('Please set the baud rate and connect to a serial port before sending a message.');
    return;
  }

  message = message.replace(/\s+/g, '');

  const isBinaryMessage = /^[01]+$/.test(message);

  const uniqueBaudRates = [...new Set(connectedBaudRates)];
  if (uniqueBaudRates.length > 1) {
    console.log('Baud rates do not match. Disconnecting all ports.');
    alert('Baud rates do not match across all connected ports. Disconnecting all ports.');
    disconnectAllPorts();
    return;
  }

  message = message.replace(/[\[\]]/g, ''); // Köşeli parantezleri temizle
  const data = new TextEncoder().encode(message + '\n');
  
  try {
    for (let i = 0; i < writers.length; i++) {
      if (activePorts[portIds[i]]) {
        await writers[i].write(data);
        console.log(`Message sent from Port ${portIds[i]} with baud rate ${baudRate}: ${message}`);
        displayMessage(message, 'sent'); // Gönderilen mesajı 'sent' olarak işaretle
        if (isBinaryMessage) {
          const displayMessageText = binaryToAscii(message);
          updateWaveformDisplay(message, displayMessageText);
        }
        socket.emit('message', { message, port: portIds[i], baudRate: baudRate });
      }
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}




const form = document.getElementById('messageForm');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = document.getElementById('message').value.trim();
  if (message) {
    sendMessage(message);
    document.getElementById('message').value = '';
  }
});

function updateWaveformDisplay(message, asciiMessage = '') {
  const isValidMessage = /^[01]+$/.test(message);
  if (!isValidMessage) {
    document.getElementById('sclWaveform').innerHTML = '';
    document.getElementById('sdaWaveform').innerHTML = '';
    document.getElementById('asciiDisplay').innerHTML = '';
    return;
  }

  const sclWaveform = document.getElementById('sclWaveform');
  const sdaWaveform = document.getElementById('sdaWaveform');
  const asciiDisplay = document.getElementById('asciiDisplay');

  const fragmentSCL = document.createDocumentFragment();
  const fragmentSDA = document.createDocumentFragment();

  const borderWidth = '2px';

  for (let i = 0; i < message.length * 2; i++) {
    const bitContainer = document.createElement('div');
    bitContainer.style.display = 'inline-block';
    bitContainer.style.position = 'relative';
    bitContainer.style.height = '50px';
    bitContainer.style.width = '10px';
    const verticalLine = document.createElement('div');
    verticalLine.style.position = 'absolute';
    verticalLine.style.width = borderWidth;
    verticalLine.style.backgroundColor = 'grey';

    const horizontalLine = document.createElement('div');
    horizontalLine.style.position = 'absolute';
    horizontalLine.style.height = borderWidth;
    horizontalLine.style.width = '100%';

    if (i % 2 === 0) {
      horizontalLine.style.top = '0';
      horizontalLine.style.backgroundColor = 'blue';
      verticalLine.style.bottom = '0';
      verticalLine.style.height = '100%';
    } else {
      horizontalLine.style.bottom = '0';
      horizontalLine.style.backgroundColor = 'blue';
      verticalLine.style.top = '0';
      verticalLine.style.height = '100%';
    }

    bitContainer.appendChild(verticalLine);
    bitContainer.appendChild(horizontalLine);
    fragmentSCL.appendChild(bitContainer);
  }

  // Generate SDA waveform
  let previousBit = null;
  for (let i = 0; i < message.length; i++) {
    const bit = message[i];

    const bitContainer = document.createElement('div');
    bitContainer.style.display = 'inline-block';
    bitContainer.style.position = 'relative';
    bitContainer.style.height = '70px';
    bitContainer.style.width = '20px';

    const verticalLine = document.createElement('div');
    verticalLine.style.position = 'absolute';
    verticalLine.style.width = borderWidth;
    verticalLine.style.backgroundColor = 'grey';

    const horizontalLine = document.createElement('div');
    horizontalLine.style.position = 'absolute';
    horizontalLine.style.height = borderWidth;
    horizontalLine.style.width = '100%';

    if (bit === '0') {
      horizontalLine.style.bottom = '20px';
      horizontalLine.style.backgroundColor = 'red';
      if (previousBit === '1') {
        verticalLine.style.top = '0';
        verticalLine.style.height = 'calc(100% - 20px)';
      } else {
        verticalLine.style.display = 'none';
      }
    } else if (bit === '1') {
      horizontalLine.style.top = '0';
      horizontalLine.style.backgroundColor = 'green';
      if (previousBit === '0') {
        verticalLine.style.bottom = '20px'; 
        verticalLine.style.height = 'calc(100% - 20px)';
      } else {
        verticalLine.style.display = 'none';
      }
    }

    const bitLabel = document.createElement('div');
    bitLabel.style.position = 'absolute';
    bitLabel.style.bottom = '0'; 
    bitLabel.style.width = '100%';
    bitLabel.style.textAlign = 'center';
    bitLabel.innerText = bit;

    bitContainer.appendChild(verticalLine);
    bitContainer.appendChild(horizontalLine);
    bitContainer.appendChild(bitLabel);

    fragmentSDA.appendChild(bitContainer);
    previousBit = bit;
  }

  sclWaveform.innerHTML = '';
  sdaWaveform.innerHTML = '';
  sclWaveform.appendChild(fragmentSCL);
  sdaWaveform.appendChild(fragmentSDA);

  asciiDisplay.innerText = " " + asciiMessage;
}

function binaryToAscii(binaryStr) {
  let asciiStr = '';
  for (let i = 0; i < binaryStr.length; i += 8) {
    let byte = binaryStr.slice(i, i + 8);
    let charCode = parseInt(byte, 2);
    asciiStr += String.fromCharCode(charCode);
  }
  return asciiStr;
}


function createAsciiDisplay() {
  const waveformBox = document.querySelector('.waveform-box');
  const asciiDisplay = document.createElement('div');
  asciiDisplay.id = 'asciiDisplay';
  asciiDisplay.style.marginTop = '10px';
  waveformBox.appendChild(asciiDisplay);
  return asciiDisplay;
}

function startEmulator() {
  emulatorInterval = setInterval(() => {
    if (!isConnected) {
      clearInterval(emulatorInterval);
      return;
    }
    let fakeMessage = '';
    for (let i = 0; i < 1024; i++) {
      fakeMessage += Math.random() > 0.5 ? '1' : '0';
    }

    sendMessage(fakeMessage, true);
  }, 1000);
}

function stopEmulator() {
  clearInterval(emulatorInterval);
}

const emulatorButtonContainer = document.getElementById('emulatorButtonContainer');

const startEmulatorButton = document.createElement('button');
startEmulatorButton.innerText = 'Start Emulator';
startEmulatorButton.className = 'emulator-button';
startEmulatorButton.addEventListener('click', startEmulator);

const stopEmulatorButton = document.createElement('button');
stopEmulatorButton.innerText = 'Stop Emulator';
stopEmulatorButton.className = 'stop-emulator-button';
stopEmulatorButton.addEventListener('click', stopEmulator);

emulatorButtonContainer.appendChild(startEmulatorButton);
emulatorButtonContainer.appendChild(stopEmulatorButton);

socket.on('disconnectAll', (reason) => {
    alert(reason);
    disconnectAllPorts();
});

// Yeni kodlar ekle
socket.on('randomNumber', (number) => {
  // Mesajı köşeli parantez içinde almak
  number = `[${number}]`;
  
  // Mesajı virgülden ayırmak
  const numberParts = number.split(',');
  const displayContent = numberParts.length > 1 ? numberParts[1] : number;
  
  // Mesajı doğru şekilde gönder ve göster
  sendMessage(displayContent, true);
});

