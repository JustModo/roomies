import WebSocket from 'ws';

export interface TestWsClient {
  ws: WebSocket;
  send: (event: string, payload?: any) => void;
  waitForEvent: (eventName: string, timeoutMs?: number) => Promise<any>;
  close: () => Promise<void>;
}

export function createTestWsClient(url: string, token?: string): Promise<TestWsClient> {
  return new Promise((resolve, reject) => {
    const fullUrl = token ? `${url}?token=${token}` : url;
    const ws = new WebSocket(fullUrl);

    const receivedMessages: any[] = [];
    const messageListeners: Array<(msg: any) => void> = [];

    ws.on('open', () => {
      resolve({
        ws,
        send: (event: string, payload: any = {}) => {
          ws.send(JSON.stringify({ event, payload }));
        },
        waitForEvent: (eventName: string, timeoutMs = 5000) => {
          return new Promise((res, rej) => {
            // Check if already received
            const existingIdx = receivedMessages.findIndex((m) => m.event === eventName);
            if (existingIdx !== -1) {
              const [msg] = receivedMessages.splice(existingIdx, 1);
              return res(msg);
            }

            const timer = setTimeout(() => {
              const idx = messageListeners.indexOf(listener);
              if (idx !== -1) messageListeners.splice(idx, 1);
              rej(new Error(`Timeout waiting for WebSocket event "${eventName}"`));
            }, timeoutMs);

            const listener = (msg: any) => {
              if (msg.event === eventName) {
                clearTimeout(timer);
                const idx = messageListeners.indexOf(listener);
                if (idx !== -1) messageListeners.splice(idx, 1);
                const msgIdx = receivedMessages.indexOf(msg);
                if (msgIdx !== -1) receivedMessages.splice(msgIdx, 1);
                res(msg);
              }
            };

            messageListeners.push(listener);
          });
        },
        close: () => {
          return new Promise((res) => {
            ws.once('close', () => res());
            ws.close();
          });
        },
      });
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        receivedMessages.push(parsed);
        // Notify listeners
        for (const listener of [...messageListeners]) {
          listener(parsed);
        }
      } catch (err) {
        // Ignore non-JSON messages
      }
    });

    ws.on('error', (err) => {
      reject(err);
    });
  });
}
