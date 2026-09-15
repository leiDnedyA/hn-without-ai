import { useSyncExternalStore } from "react";

const STORAGE_KEY = "unslop.hn.username";
const CHANGE_EVENT = "unslop:username-change";
// Keep the controls usable even when browser storage is unavailable.
let temporaryUsername: string | null | undefined;

function getUsername(): string | null {
  if (temporaryUsername !== undefined) return temporaryUsername;
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) {
      temporaryUsername = undefined;
      onChange();
    }
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function setUsername(username: string | null) {
  try {
    if (username) {
      window.localStorage.setItem(STORAGE_KEY, username);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    temporaryUsername = undefined;
  } catch {
    temporaryUsername = username;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// The shared static page always renders anonymously before hydration.
const getServerSnapshot = () => null;

export function useHNUsername() {
  const username = useSyncExternalStore(subscribe, getUsername, getServerSnapshot);

  function login() {
    const input = window.prompt("Enter your Hacker News username to show your threads:");
    const value = input?.trim();
    if (value) setUsername(value);
  }

  return { username, login, logout: () => setUsername(null) };
}
