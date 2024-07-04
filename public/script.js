const socket = io();
const connectButton = document.getElementById('connectButton');
const dataDiv = document.getElementById('data');
const baudRateInput = document.getElementById('baudRateInput');
const setBaudRateButton = document.getElementById('setBaudRateButton');
let baudRate;
let ports = [];
let readers = [];
let writers = [];

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
    
    readPort(reader);
  } catch (error) {
    console.error('Error connecting to serial port:', error);
  }
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

        socket.emit('message', completeMessage);
        displayMessage(completeMessage);
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
}

socket.on('message', (message) => {
  console.log(`Message received: ${message}`);
  displayMessage(message, 'received');
});

const form = document.getElementById('messageForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = document.getElementById('message').value.trim();
  if (message && writers.length > 0) {
    const messageWithSender = `${message}`;
    console.log(`Sending message: ${messageWithSender}`);
    sendMessage(messageWithSender);
    document.getElementById('message').value = '';
    displayMessage(message, 'sent');
  } else {
    console.error('No connected serial ports available to send the message.');
  }
});

async function sendMessage(message) {
  const data = new TextEncoder().encode(message + '\n');
  try {
    for (const writer of writers) {
      await writer.write(data);
    }
    console.log(`Message sent: ${message}`);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}
