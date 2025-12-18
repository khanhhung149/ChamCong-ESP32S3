import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/authServices.js';

const ProtectedRoute = ({ children, role }) => {
  const user = authService.getUser();
  const location = useLocation(); 

  // 1. Chưa đăng nhập -> Về Login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. Kiểm tra quyền
  // Nếu yêu cầu role cụ thể mà user không có role đó
  if (role && user.role !== role) {
    
    // [FIX] Thêm logic điều hướng cho Admin
    let homePath = '/employee';
    if (user.role === 'admin') homePath = '/admin';
    else if (user.role === 'manager') homePath = '/manager';

    // *Mở rộng (Tùy chọn): Nếu muốn Admin vào được trang của Manager thì thêm dòng này:
    // if (user.role === 'admin' && role === 'manager') return children;

    return <Navigate to={homePath} replace />;
  }

  return children;
};

export default ProtectedRoute;