import { io } from 'socket.io-client';

let socket = null;

/** One shared connection per browser tab. */
export function getSocket() {
  if (!socket) socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  return socket;
}

/** Reconnect so the server re-reads the session cookie (after admin sign-in or sign-out). */
export function resetSocket() {
  closeSocket();
  return getSocket();
}

export function closeSocket() {
  if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
}
