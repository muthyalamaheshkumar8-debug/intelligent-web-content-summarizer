import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 110000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'WebContentSummarizer' },
});

export function errorMessage(error) {
  if (error.code === 'ECONNABORTED')
    return 'The request took too long. Check your library before trying again; the summary may still finish.';
  return (
    error.response?.data?.message ||
    'We could not reach the service. Check your connection and try again.'
  );
}

export function openEvents() {
  return new EventSource(`${api.defaults.baseURL}/api/events`, {
    withCredentials: true,
  });
}

export default api;
