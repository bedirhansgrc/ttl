const socket = io();
const connectButton = document.getElementById('connectButton');
const dataDiv = document.getElementById('data');
let ports = [];
let readers = [];
let writers = [];
let localMessages = new Set();

connectButton.addEventListener('click', async () => {
  try {
    console.log('Connecting to serial port...');

    // Connect to the serial port
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    const reader = port.readable.getReader();
    const writer = port.writable.getWriter();

    // Add port, reader, and writer to arrays
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
  let buffer = ''; // Buffer to accumulate incoming data

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      console.log('Serial port reading finished');
      break;
    }
    const decodedValue = new TextDecoder().decode(value);
    buffer += decodedValue; // Accumulate data in buffer

    // Process each complete message in the buffer
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const completeMessage = buffer.substring(0, newlineIndex).trim();
      buffer = buffer.substring(newlineIndex + 1);
      if (completeMessage) { // Check if message is not empty
        console.log(`Data received: ${completeMessage}`);
        if (!localMessages.has(completeMessage)) { // Check if the message is already displayed locally
          socket.emit('message', completeMessage); // Emit message through WebSocket
          displayMessage(completeMessage); // Display message locally
          localMessages.add(completeMessage); // Add message to the local set
        }
      }
    }
  }
}

function displayMessage(message) {
  const p = document.createElement('p');
  p.innerText = message;
  dataDiv.appendChild(p);

  // Add a divider
  const hr = document.createElement('hr');
  hr.classList.add('message-divider');
  dataDiv.appendChild(hr);
}

socket.on('message', (message) => {
  console.log(`Message received: ${message}`);
  if (!localMessages.has(message)) { // Check if the message is already displayed locally
    displayMessage(message);
    localMessages.add(message); // Add message to the local set to avoid re-displaying
  }
});

const form = document.getElementById('messageForm');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = document.getElementById('message').value.trim(); // Trim whitespace
  if (message && writers.length > 0) { // Check if message is not empty and at least one writer exists
    console.log(`Sending message: ${message}`);
    sendMessage(message);
    document.getElementById('message').value = ''; // Clear the input field after sending the message
    displayMessage(message); // Display the message immediately after sending
    localMessages.add(message); // Add message to the local set
  } else {
    console.error('No connected serial ports available to send the message.');
  }
});

async function sendMessage(message) {
  const data = new TextEncoder().encode(message + '\n');
  try {
    // Send the message to all connected ports
    for (const writer of writers) {
      await writer.write(data);
    }
    console.log(`Message sent: ${message}`);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}
