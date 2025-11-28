import React, { useState, useEffect } from 'react';
import { api } from '../services/authServices.js'; 
import { API_BASE_URL } from '../config.js';

const ImageCell = ({ path }) => {
    if (!path) return <span className="text-gray-400">N/A</span>;
    return (
        <a href={`${API_BASE_URL}${path}`} target="_blank" rel="noopener noreferrer">
            <img 
                src={`${API_BASE_URL}${path}`} 
                alt="Proof" 
                className="w-12 h-16 object-cover rounded-md shadow-sm hover:scale-150 transition-transform"
            />
        </a>
    );
};

const formatTime = (dateTimeString) => {
    if (!dateTimeString) return '...';
    return new Date(dateTimeString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const EmployeeDashboard = () => {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState('');

  const fetchMyData = async () => {
    setLoading(true);
    try {
      const userRes = await api.get(`/api/users/profile`);
      setUser(userRes.data); 

      const logsRes = await api.get(`/api/my-logs`);
      setLogs(logsRes.data);

    } catch (err) {
      setError('Không thể tải dữ liệu cá nhân.');
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMyData();
  }, []);

  const handleAvatarUpload = async (e) => {
    e.preventDefault();
    if (!avatarFile) {
        setUploadMessage('Vui lòng chọn 1 file ảnh');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', avatarFile);

    try {
      const res = await api.post(`/api/users/profile/avatar`, formData);
      
      setUploadMessage(res.data.message);
      setUser(prev => ({ ...prev, avatar_path: res.data.avatar_path })); 
      setAvatarFile(null);

    } catch (err) {
      setUploadMessage('Lỗi upload avatar');
    }
  };

  if (loading) {
    return <p>Đang tải dữ liệu...</p>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Trang cá nhân</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-1 space-y-6">
            <div className="p-6 bg-white rounded-xl shadow-lg text-center">
                <img
                    src={`${API_BASE_URL}${user?.avatar_path || '/public/avatars/default.png'}`}
                    alt="Avatar"
                    className="w-40 h-40 rounded-full mx-auto mb-4 object-cover border-4 border-gray-200"
                />
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{user?.name}</h2>
                    <p className="text-gray-500">{user?.email}</p>
                    <p className="text-gray-500">Mã NV: {user?.employee_id}</p>
                    <span className="mt-2 px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {user?.role}
                    </span>
                </div>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold mb-3">Cập nhật Ảnh đại diện</h3>
                <form onSubmit={handleAvatarUpload} className="space-y-3">
                <input 
                    type="file" 
                    onChange={(e) => setAvatarFile(e.target.files[0])}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <button type="submit" className="w-full px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">Lưu Avatar</button>
                {uploadMessage && <p className="text-sm text-gray-600 mt-2">{uploadMessage}</p>}
                </form>
            </div>
        </div>

        <div className="lg:col-span-2 p-6 bg-white rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Lịch sử Chấm công Gần đây</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ vào</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh vào</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ ra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh ra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tổng giờ</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 text-center text-gray-500">Bạn chưa có lượt chấm công nào.</td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-500">{new Date(log.date).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4 text-sm text-green-600 font-semibold">{formatTime(log.checkInTime)}</td>
                      <td className="px-6 py-4"><ImageCell path={log.checkInImage} /></td>
                      <td className="px-6 py-4 text-sm text-red-600 font-semibold">{formatTime(log.checkOutTime)}</td>
                      <td className="px-6 py-4"><ImageCell path={log.checkOutImage} /></td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{log.totalHours ? `${log.totalHours} h` : '...'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;