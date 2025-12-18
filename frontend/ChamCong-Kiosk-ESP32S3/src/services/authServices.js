
import axios from 'axios';
import { API_BASE_URL } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL 
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token'); 
    if (token) {
      config.headers['Authorization'] = 'Bearer ' + token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


const login = async (account, password) => {
  const response = await api.post('/api/auth/login', { account, password });
  
  if (response.data.token) {
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.user));
  }
  return response.data;
};

const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

const getToken = () => {
  return localStorage.getItem('token');
};

const getUser = () => {
  const userString = localStorage.getItem('user');
  
  if (!userString || userString === "undefined") {
    return null;
  }
  
  try {
    return JSON.parse(userString);
  } catch (error) {
    console.error("AuthService: Lỗi parse user từ localStorage", error);
    localStorage.removeItem('user'); 
    return null;
  }
};

export { api };

export default {
  login,
  logout,
  getToken,
  getUser,
};