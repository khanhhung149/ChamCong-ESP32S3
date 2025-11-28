const SERVER_IP = '192.168.88.119'; 

const API_HOST = window.location.hostname === 'localhost' ? SERVER_IP : window.location.hostname;

const API_PORT = 5000;

export const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;

export const WS_URL = `ws://${API_HOST}:${API_PORT}/ws`;