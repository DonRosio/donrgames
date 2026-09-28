/** Production server started for the end-to-end tests (see server.ts). */
export const E2E_PORT = 4173;
// 127.0.0.1 (not localhost): it is both the public origin checked by the server and a secure
// context, so the microphone is allowed without HTTPS.
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
