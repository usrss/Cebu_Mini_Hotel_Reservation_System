import { useState } from 'react';
import { verifyCode } from '../../services/api';

export default function VerifyCode({ email }) {
  const [code, setCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await verifyCode({ email, code });
      alert('Registration successful! You can now log in.');
      window.location.href = '/login'; // redirect to login page
    } catch (err) {
      alert(err.response?.data?.code || 'Verification failed');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Enter Verification Code</h2>
      <input
        type="text"
        name="code"
        placeholder="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />
      <button type="submit">Verify</button>
    </form>
  );
}
