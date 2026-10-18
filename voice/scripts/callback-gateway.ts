import 'dotenv/config';
import { callbackGateway } from '../src/server/callback-gateway';
const port = Number(process.env.CHORUS_CALLBACK_PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000)
  throw new Error('CHORUS_CALLBACK_PORT must be 1024..65535 and different from app port 3000');
const server = callbackGateway({
  backend: 'http://127.0.0.1:3000',
  toolSecret: process.env.BOLNA_TOOL_SECRET || '',
  webhookSecret: process.env.BOLNA_WEBHOOK_SECRET || '',
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Callback gateway listening on 127.0.0.1:${port}. Dashboard routes are not exposed.`);
});
server.on('error', () => {
  console.error('Callback gateway could not listen. Check its port.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
