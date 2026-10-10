/** Small fetch wrapper: JSON in, JSON out, errors as Error(message). */
async function request(method, url, body) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      credentials: 'include',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    // The request never reached the server: say so in plain words, not "Failed to fetch".
    throw new Error('No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url)
};
