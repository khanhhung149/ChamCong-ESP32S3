import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import { API_BASE_URL } from '../config.js'; 
import { api } from '../services/authServices.js'; 

const StatsCard = ({ title, value, unit, icon, colorClass }) => (
  <div className={`p-6 bg-white rounded-xl shadow-lg flex items-center justify-between ${colorClass}`}>
    <div>
      <div className={`text-3xl font-bold ${colorClass.replace('bg-', 'text-')}`}>{value}</div>
      <div className="text-sm font-medium text-gray-500">{title}</div>
    </div>
  </div>
);

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
const ManagerDashboard = () => {
  const [stats, setStats] = useState({ totalUsers: '...', presentToday: '...', absentToday: '...' });
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const { kioskCount, lastJsonMessage } = useWebSocket();


  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const statsRes = await api.get('/api/stats/dashboard'); // Bỏ full URL và header
      setStats(statsRes.data);

      const logsRes = await api.get('/api/stats/today_logs');
        
      
      
      setTodayLogs(logsRes.data);

    } catch (error) {
      console.error("Lỗi khi tải dữ liệu Dashboard:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (lastJsonMessage) {
        if (lastJsonMessage.type === 'new_log') {
            console.log('Real-time log received (Dashboard):', lastJsonMessage.data);
            
            setTodayLogs(prevLogs => {
                const existingLogIndex = prevLogs.findIndex(l => l._id === lastJsonMessage.data._id);
                if (existingLogIndex !== -1) {
                    const newLogs = [...prevLogs];
                    newLogs[existingLogIndex] = lastJsonMessage.data;
                    return newLogs;
                } else {
                    return [lastJsonMessage.data, ...prevLogs];
                }
            });
            fetchDashboardData();
        }
    }
  }, [lastJsonMessage]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Trang chủ Manager</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Tổng số Nhân viên" value={stats.totalUsers} colorClass="bg-blue-100 text-blue-800" />
        <StatsCard title="Hiện diện Hôm nay" value={stats.presentToday} colorClass="bg-green-100 text-green-800" />
        <StatsCard title="Vắng mặt Hôm nay" value={stats.absentToday} colorClass="bg-red-100 text-red-800" />
        <StatsCard 
            title="Trạng thái Kiosk" 
            value={kioskCount > 0 ? `Online (${kioskCount})` : 'Offline'} 
            colorClass={kioskCount > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"} 
        />
      </div>

      <div className="p-6 bg-white rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Trạng thái Chấm công Hôm nay</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã NV</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giờ vào</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ảnh vào</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giờ ra</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ảnh ra</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tổng giờ</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="6" className="p-4 text-center">Đang tải...</td></tr>
              ) : todayLogs.map(log => (
                <tr key={log._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{log.employee_id}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-green-600">{formatTime(log.checkInTime)}</td>
                  <td className="px-6 py-4"><ImageCell path={log.checkInImage} /></td>
                  <td className="px-6 py-4 text-sm font-semibold text-red-600">{formatTime(log.checkOutTime)}</td>
                  <td className="px-6 py-4"><ImageCell path={log.checkOutImage} /></td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{log.totalHours ? `${log.totalHours} h` : '...'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ManagerDashboard;