const STORAGE_KEY = "wadar_tts";

/** Per-device toggle (PRD F1.2: "Suara TTS dapat dimatikan per perangkat"). On by default. */
export function isTtsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTtsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // storage blocked (private mode) — the toggle just won't persist
  }
}

/** Web Speech API, Bahasa Indonesia voice when the device has one (ARCHITECTURE §6.3). */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !isTtsEnabled()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "id-ID";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("id"));
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}
