import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Login from './components/Login';
import Home from './components/Home';
import { Capacitor } from '@capacitor/core';

// Set VITE_API_URL in .env file.
// Example: VITE_API_URL=https://attendance-backend.onrender.com
export const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative shadow-2xl overflow-hidden">
        <Routes>
          <Route 
            path="/login" 
            element={!isAuthenticated ? <Login setAuth={setIsAuthenticated} /> : <Navigate to="/home" />} 
          />
          <Route 
            path="/home" 
            element={isAuthenticated ? <Home setAuth={setIsAuthenticated} /> : <Navigate to="/login" />} 
          />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
