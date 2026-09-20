/* Offline license verification. No server, no merchant of record, no network call.
   A key is <PREFIX>-<base64url payload>.<base64url ECDSA P-256 signature over the payload>.
   The app holds only the public key, so keys cannot be forged from the app's source. */
(function (root) {
  'use strict';
  const L = {};
  const b64uToBytes = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const bytesToStr = b => new TextDecoder().decode(b);
  const strToBytes = s => new TextEncoder().encode(s);

  L.parse = function (key) {
    const k = String(key || '').trim().replace(/\s+/g, '');
    const m = k.match(/^([A-Z]+)-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    let payload;
    try { payload = JSON.parse(bytesToStr(b64uToBytes(m[2]))); } catch (e) { return null; }
    return { prefix: m[1], payloadRaw: m[2], payload, sig: m[3] };
  };

  /* publicKeyJwk: the JWK printed by tools/keygen.mjs. product: the product code the key must carry. */
  L.verify = async function (key, publicKeyJwk, product) {
    const p = L.parse(key);
    if (!p) return { valid: false, reason: 'That key is not in the right format. Copy the whole line from your email.' };
    if (product && p.payload.p !== product) return { valid: false, reason: 'That key is for a different product.' };
    if (p.payload.x && Date.now() > p.payload.x * 1000) return { valid: false, reason: 'That key expired on ' + new Date(p.payload.x * 1000).toISOString().slice(0, 10) + '.' };
    let ok = false;
    try {
      const pub = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uToBytes(p.sig), strToBytes(p.payloadRaw));
    } catch (e) { return { valid: false, reason: 'This browser could not check the key. Update the browser and try again.' }; }
    if (!ok) return { valid: false, reason: 'That key did not check out. Paste it again, or contact support with your order number.' };
    return { valid: true, payload: p.payload };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.License = L;
})(typeof window !== 'undefined' ? window : globalThis);
