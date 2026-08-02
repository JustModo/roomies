import WebSocket from 'ws';

export interface TestWsClient {
  ws: WebSocket;
  send: (event: string, payload?: any) => void;
  waitForEvent: <T = any>(eventName: string, timeoutMs?: number) => Promise<T>;
  waitForEventMatching: <T = any>(eventName: string, predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<T>;
  getAllReceived: () => any[];
  close: () => Promise<void>;
}

export function createTestWsClient(url: string, token?: string): Promise<TestWsClient> {
  return new Promise((resolve, reject) => {
    const fullUrl = token ? `${url}?token=${token}` : url;
    const ws = new WebSocket(fullUrl);

    const receivedMessages: any[] = [];
    const messageListeners: Array<(msg: any) => boolean> = [];

    ws.on('open', () => {
      const client: TestWsClient = {
        ws,
        send: (event: string, payload: any = {}) => {
          ws.send(JSON.stringify({ event, payload }));
        },
        waitForEventMatching: <T = any>(
          eventName: string,
          predicate: (msg: any) => boolean,
          timeoutMs = 5000
        ): Promise<T> => {
          return new Promise((res, rej) => {
            const existingIdx = receivedMessages.findIndex(
              (m) => m.event === eventName && predicate(m)
            );
            if (existingIdx !== -1) {
              const [msg] = receivedMessages.splice(existingIdx, 1);
              return res(msg as T);
            }

            const timer = setTimeout(() => {
              const idx = messageListeners.indexOf(listener);
              if (idx !== -1) messageListeners.splice(idx, 1);
              rej(new Error(`Timeout waiting for WebSocket event "${eventName}" matching predicate`));
            }, timeoutMs);

            const listener = (msg: any) => {
              if (msg.event === eventName && predicate(msg)) {
                clearTimeout(timer);
                const idx = messageListeners.indexOf(listener);
                if (idx !== -1) messageListeners.splice(idx, 1);
                const msgIdx = receivedMessages.indexOf(msg);
                if (msgIdx !== -1) receivedMessages.splice(msgIdx, 1);
                res(msg as T);
                return true;
              }
              return false;
            };

            messageListeners.push(listener);
          });
        },
        waitForEvent: <T = any>(eventName: string, timeoutMs = 5000): Promise<T> => {
          return client.waitForEventMatching<T>(eventName, () => true, timeoutMs);
        },
        getAllReceived: () => [...receivedMessages],
        close: () => {
          return new Promise((res) => {
            if (ws.readyState === WebSocket.CLOSED) {
              res();
              return;
            }
            ws.once('close', () => res());
            ws.close();
          });
        },
      };

      resolve(client);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        receivedMessages.push(parsed);

        // Notify listeners and remove any listener that matched
        for (let i = messageListeners.length - 1; i >= 0; i--) {
          const matched = messageListeners[i](parsed);
          if (matched) break;
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
