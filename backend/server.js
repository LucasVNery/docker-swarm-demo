const express = require('express');
const os = require('os');
const morgan = require('morgan');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
function resolveMessage() {
  const messageFromEnv = process.env.MESSAGE;
  const messageFilePath = process.env.MESSAGE_FILE;
  if (messageFilePath && fs.existsSync(messageFilePath)) {
    try {
      const content = fs.readFileSync(messageFilePath, 'utf8').trim();
      if (content) return content;
    } catch (_e) {
      // ignore and fallback
    }
  }
  return messageFromEnv || 'Hello from Backend';
}
let MESSAGE = resolveMessage();

const app = express();
app.disable('x-powered-by');
// Add hostname to logs for easy visualization in Portainer
morgan.token('hostname', () => os.hostname());
app.use(morgan(':date[iso] :remote-addr :method :url :status - host=:hostname - :response-time ms'));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/info', (_req, res) => {
  res.json({
    role: 'backend',
    message: MESSAGE,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${PORT}`);
});


