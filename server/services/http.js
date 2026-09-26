// fetch con timeout y errores legibles
async function request(url, { method = 'GET', headers = {}, body, json, timeout = 20000 } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeout) };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; } else if (body !== undefined) init.body = body;
  const res = await fetch(url, init);
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error_description || data?.detail || data?.description || (typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data)?.slice(0, 300));
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}
module.exports = { request };
