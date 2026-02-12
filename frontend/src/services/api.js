import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api/users';

export const registerUser = async (userData) => {
  return axios.post(`${API_URL}/register/request/`, userData);
};

export const verifyCode = async (codeData) => {
  return axios.post(`${API_URL}/register/verify/`, codeData);
};
