import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const api = axios.create({ baseURL: API_URL, timeout: 15000, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('sherise_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function money(value: number | string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
}

api.interceptors.response.use(response => response, error => {
  if (error?.response?.status === 401 && localStorage.getItem('sherise_token')) {
    localStorage.removeItem('sherise_token');
    window.dispatchEvent(new Event('sherise-auth-expired'));
  }
  return Promise.reject(error);
});
