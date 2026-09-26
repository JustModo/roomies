export type OpenSocket = (path: string, token: string) => WebSocket;

export const openSocket: OpenSocket = (path, token) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${window.location.host}${path}`, [`bearer.${token}`]);
};
