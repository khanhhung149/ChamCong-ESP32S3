import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/authServices.js';

const ProtectedRoute = ({ children, role }) => {
  const user = authService.getUser();
  const location = useLocation(); 

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    const homePath = user.role === 'manager' ? '/manager' : '/employee';
    return <Navigate to={homePath} replace />;
  }

  return children;
};

export default ProtectedRoute;