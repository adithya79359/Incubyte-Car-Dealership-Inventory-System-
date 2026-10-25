export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { token, method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to connect. Check your connection and try again.', 0);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || 'The request failed. Please try again.', response.status);
  return data;
}
