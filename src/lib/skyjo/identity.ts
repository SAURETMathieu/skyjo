const ID_KEY = "skyjo-player-id";
const NAME_KEY = "skyjo-name";

export function getPlayerId() {
  const existing = localStorage.getItem(ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(ID_KEY, id);
  return id;
}

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function saveName(name: string) {
  localStorage.setItem(NAME_KEY, name.trim());
}
