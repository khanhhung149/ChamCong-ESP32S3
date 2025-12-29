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
                    <p className="text-gray-500">{user?.account}</p>
                    <p className="text-gray-500">Mã NV: {user?.employee_id}</p>
                    <span className={`mt-2 px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full
                        ${user.role === 'manager' || user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-700 border-purple-200' // Màu tím cho Quản lý
                        : 'bg-green-100 text-green-700 border-green-200'   // Màu xanh cho Nhân viên
                    }`}>
                    {user.role === 'manager' ? 'Quản lý' : user.role === 'admin' ? 'Admin' : 'Nhân viên'}
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

        <div className="lg:col-span-2 flex flex-col gap-6">
    {/* Card Thống kê nhanh (Optional - Giúp bảng đỡ trống) */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
         <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
             <div className="text-2xl font-bold text-blue-600">{logs.length}</div>
             <div className="text-xs text-blue-400 font-medium uppercase">Ngày công</div>
         </div>
         {/* Bạn có thể thêm các box thống kê khác ở đây nếu muốn */}
    </div>

    {/* Bảng Lịch sử */}
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden flex-1">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                Lịch sử chấm công
            </h2>
        </div>
        
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead>
                    <tr className="bg-white text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b-2 border-gray-100">
                        <th className="px-4 py-3 text-left">Ngày</th>
                        <th className="px-2 py-3 text-center text-green-600 bg-green-50/30">Vào Sáng</th>
                        <th className="px-2 py-3 text-center text-yellow-600 bg-yellow-50/30">Ra Trưa</th>
                        <th className="px-2 py-3 text-center text-orange-600 bg-orange-50/30">Vào Chiều</th>
                        <th className="px-2 py-3 text-center text-red-600 bg-red-50/30">Ra Về</th>
                        <th className="px-4 py-3 text-center text-blue-600">Tổng giờ</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {logs.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">Bạn chưa có dữ liệu chấm công nào.</td></tr>
                    ) : (
                        logs.map(log => (
                            <tr key={log._id} className="hover:bg-gray-50 transition-colors">
                                {/* Cột Ngày & Ghi chú */}
                                <td className="px-4 py-3 whitespace-nowrap border-r border-gray-50">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-800">
                                            {new Date(log.date).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit', year:'numeric'})}
                                        </span>
                                        {log.note && (
                                            <span className={`text-[10px] mt-1 px-1.5 py-0.5 rounded border w-fit
                                                ${log.note.includes('trễ') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-100 text-gray-500 border-gray-200'}
                                            `}>
                                                {log.note}
                                            </span>
                                        )}
                                    </div>
                                </td>

                                {/* Vào Sáng */}
                                <td className="px-2 py-3 text-center border-r border-gray-50 bg-green-50/10">
                                    <div className="font-mono text-sm font-bold text-green-700 mb-1">
                                        {formatTime(log.checkInTime)}
                                    </div>
                                    <div className="flex justify-center scale-90 origin-top">
                                        <ImageCell path={log.checkInImage} />
                                    </div>
                                </td>

                                {/* Ra Trưa */}
                                <td className="px-2 py-3 text-center border-r border-gray-50 bg-yellow-50/10">
                                    <div className="font-mono text-sm text-gray-600 mb-1">
                                        {formatTime(log.checkOutTimeMorning)}
                                    </div>
                                    <div className="flex justify-center scale-90 origin-top">
                                        <ImageCell path={log.checkOutImageMorning} />
                                    </div>
                                </td>

                                {/* Vào Chiều */}
                                <td className="px-2 py-3 text-center border-r border-gray-50 bg-orange-50/10">
                                    <div className="font-mono text-sm text-gray-600 mb-1">
                                        {formatTime(log.checkInTimeAfternoon)}
                                    </div>
                                    <div className="flex justify-center scale-90 origin-top">
                                        <ImageCell path={log.checkInImageAfternoon} />
                                    </div>
                                </td>

                                {/* Ra Về */}
                                <td className="px-2 py-3 text-center border-r border-gray-50 bg-red-50/10">
                                    <div className="font-mono text-sm font-bold text-red-700 mb-1">
                                        {formatTime(log.checkOutTime)}
                                    </div>
                                    <div className="flex justify-center scale-90 origin-top">
                                        <ImageCell path={log.checkOutImage} />
                                    </div>
                                </td>

                                {/* Tổng giờ */}
                                <td className="px-4 py-3 text-center align-middle">
                                    <div className={`text-sm font-bold px-3 py-1 rounded-full border
                                        ${log.totalHours >= 8 
                                            ? 'bg-blue-50 text-blue-600 border-blue-200' 
                                            : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                        {log.totalHours ? `${log.totalHours}h` : '--'}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
</div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;