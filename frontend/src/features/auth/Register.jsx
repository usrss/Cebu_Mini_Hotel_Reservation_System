import { useState } from 'react';
import { registerUser } from '../../services/api';
import VerifyCode from './VerifyCode';

export default function Register() {
  const [formData, setFormData] = useState({ email: '', password: '' }); // removed username
  const [showVerify, setShowVerify] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await registerUser(formData);
      alert('Verification code sent to your email!');
      setShowVerify(true); // show verification form
    } catch (err) {
      alert(err.response?.data?.email || 'Registration failed');
    }
  };

  if (showVerify) return <VerifyCode email={formData.email} />;

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      <input
        type="email"
        name="email"
        placeholder="Email"
        onChange={handleChange}
        required
      />
      <input
        type="password"
        name="password"
        placeholder="Password (optional for Google login)"
        onChange={handleChange}
        autoComplete="new-password"
      />
      <button type="submit">Register</button>
    </form>
  );
}
