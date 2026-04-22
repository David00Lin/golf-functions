const SESSION_KEY = "golf_session_id";

function generateUUID(): string {
  return crypto.randomUUID();
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
