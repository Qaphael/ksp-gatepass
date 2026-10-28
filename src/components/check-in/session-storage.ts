export const SESSION_COUNT_EVENT = "gatepass:session-count-change";
export const GATE_EVENT = "gatepass:gate-change";

export function readGate(eventId: string) {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(`gatepass:gate:${eventId}`) ?? ""; } catch { return ""; }
}

export function saveGate(eventId: string, value: string) {
  try { window.localStorage.setItem(`gatepass:gate:${eventId}`, value); } catch { /* Gate persistence is best effort. */ }
  window.dispatchEvent(new Event(GATE_EVENT));
}

export function readSessionAdmissionCount(eventId: string) {
  if (typeof window === "undefined") return 0;
  try { return Number(window.sessionStorage.getItem(`gatepass:checkin-count:${eventId}`) ?? 0) || 0; } catch { return 0; }
}

export function subscribeStorageEvents(callback: () => void, eventName: string) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
}

export function incrementSessionAdmissionCount(eventId: string) {
  const next = readSessionAdmissionCount(eventId) + 1;
  try { window.sessionStorage.setItem(`gatepass:checkin-count:${eventId}`, String(next)); } catch { /* Session count is convenience state only. */ }
  window.dispatchEvent(new Event(SESSION_COUNT_EVENT));
  return next;
}
