import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';
import { registerRoomHandlers } from './lib/server/socketHandlers/room';
import { registerStrokeHandlers } from './lib/server/socketHandlers/stroke';
import { registerChatHandlers } from './lib/server/socketHandlers/chat';
import { registerRoundHandlers } from './lib/server/socketHandlers/round';
import { registerTelephoneHandlers } from './lib/server/socketHandlers/telephone';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket);
    registerStrokeHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerRoundHandlers(io, socket);
    registerTelephoneHandlers(io, socket);
  });

  httpServer.listen(port, () => {
    console.log(`> draw-guess-party ready on http://localhost:${port}`);
  });
});
