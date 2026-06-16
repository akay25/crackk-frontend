import axios, { AxiosError } from 'axios';

// Local imports
const API_TIMEOUT = 30000;
export const URI = '/api';
const service = axios.create({
  baseURL: URI,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
service.interceptors.request.use(
  (config) => {
    if (config.method && config.method.toUpperCase() !== 'OPTIONS') {
      // NOTE: Logic to add token
      // const token = localStorage.getItem(LOCALSTORAGE_KEYS.TOKEN);
      // if (token) {
      //   config.withCredentials = true;
      //   config.headers.Authorization = `Bearer ${token}`;
      // }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor
service.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle global errors here
    if (error.response?.status === 401) {
      // Handle unauthorized access
      // localStorage.removeItem(LOCALSTORAGE_KEYS.TOKEN);
      // You might want to redirect to login page here
    }
    return Promise.reject(error);
  }
);

export default service;
