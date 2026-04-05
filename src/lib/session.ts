const DEVICE_KEY = "golf_device_id";
const SESSION_KEY = "golf_session_id";

function generateUUID(): string {
  return crypto.randomUUID();
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function newSession(): string {
  const id = generateUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}
