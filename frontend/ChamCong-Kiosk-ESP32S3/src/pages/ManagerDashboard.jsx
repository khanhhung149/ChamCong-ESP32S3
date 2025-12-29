import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import { API_BASE_URL } from '../config.js'; 
import { api } from '../services/authServices.js'; 
import authService from '../services/authServices.js';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

// Đăng ký các thành phần Chart.js
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

const getStatusColor = (note) => {
    if (!note) return "text-gray-500";
    if (note.includes("trễ") || note.includes("Vắng")) return "text-red-600 font-bold";
    if (note.includes("Đúng giờ")) return "text-green-600 font-bold";
    return "text-blue-600";
};
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
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const { deviceCount, lastJsonMessage } = useWebSocket();
  const activeCount = deviceCount || 0;

  const currentUser = authService.getUser();
  const isAdmin = currentUser?.role === 'admin';


  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes, weeklyRes] = await Promise.all([
          api.get('/api/stats/dashboard'),
          api.get('/api/stats/today_logs'),
          api.get('/api/stats/weekly')
      ]);

      setStats(statsRes.data);
      setTodayLogs(logsRes.data);
      setWeeklyData(weeklyRes.data);
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

  const lateCount = todayLogs.filter(log => 
      log.note && (log.note.includes('trễ') || log.note.includes('Vắng'))
  ).length;
  const onTimeCount = Math.max(0, (stats.presentToday || 0) - lateCount);
  const absentCount = stats.absentToday || 0;
  const doughnutData = {
    labels: ['Đúng giờ', 'Đi trễ', 'Vắng mặt'],
    datasets: [
      {
        data: [onTimeCount, lateCount, absentCount],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',  
          'rgba(234, 179, 8, 0.8)',   
          'rgba(239, 68, 68, 0.8)',   
        ],
        borderColor: ['#22c55e', '#eab308', '#ef4444'],
        borderWidth: 1,
      },
    ],
  };

  const barData = {
    labels: weeklyData.map(d => d.date),
    datasets: [
      {
        label: 'Đúng giờ',
        data: weeklyData.map(d => d.onTime),
        backgroundColor: 'rgba(59, 130, 246, 0.7)', // Xanh dương
        stack: 'Stack 0',
      },
      {
        label: 'Đi trễ',
        data: weeklyData.map(d => d.late),
        backgroundColor: 'rgba(234, 179, 8, 0.7)', // Vàng
        stack: 'Stack 0',
      },
    ],
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Xu hướng chấm công 7 ngày qua' },
    },
    scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">{isAdmin ? "Tổng quan hệ thống (Admin)" : "Trang chủ quản lý"}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Tổng số Nhân viên" value={stats.totalUsers} colorClass="bg-blue-100 text-blue-800" />
        <StatsCard title="Hiện diện Hôm nay" value={stats.presentToday} colorClass="bg-green-100 text-green-800" />
        <StatsCard title="Vắng mặt Hôm nay" value={stats.absentToday} colorClass="bg-red-100 text-red-800" />
        <StatsCard 
            title="Trạng thái Thiết bị" 
            value={activeCount > 0 ? `Online (${activeCount})` : 'Offline'} 
            colorClass={activeCount > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-1 flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-gray-700 mb-4">Tỷ lệ hôm nay</h3>
            <div className="w-full max-w-[250px]">
                <Doughnut data={doughnutData} />
            </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-2">
             <Bar options={barOptions} data={barData} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h2 className="text-lg font-bold text-gray-800">Trạng thái chấm công hôm nay</h2>
        <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
            Tổng: {todayLogs.length} bản ghi
        </span>
    </div>

    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-bold">
                    <th className="px-6 py-4 text-left">Nhân viên</th>
                    <th className="px-2 py-4 text-center border-l border-gray-100 text-green-600">Vào Sáng</th>
                    <th className="px-2 py-4 text-center border-l border-gray-100 text-yellow-600">Ra Trưa</th>
                    <th className="px-2 py-4 text-center border-l border-gray-100 text-orange-600">Vào Chiều</th>
                    <th className="px-2 py-4 text-center border-l border-gray-100 text-red-600">Ra Về</th>
                    <th className="px-6 py-4 text-left border-l border-gray-100">Trạng thái</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-400 italic">Đang tải dữ liệu...</td></tr>
                ) : todayLogs.length === 0 ? (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-400">Chưa có dữ liệu chấm công hôm nay.</td></tr>
                ) : todayLogs.map(log => (
                    <tr key={log._id} className="hover:bg-blue-50/30 transition-colors duration-150 group">
                        
                        {/* Cột Nhân Viên */}
                        <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                                <div className="ml-0">
                                    <div className="text-sm font-bold text-gray-900">{log.name}</div>
                                    <div className="text-xs text-gray-500 font-mono mt-0.5">{log.employee_id}</div>
                                </div>
                            </div>
                        </td>

                        {/* Cột Vào Sáng */}
                        <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                            <div className="flex flex-col items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-sm font-bold border border-green-100 shadow-sm">
                                    {formatTime(log.checkInTime)}
                                </span>
                                <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                                    <ImageCell path={log.checkInImage} />
                                </div>
                            </div>
                        </td>

                        {/* Cột Ra Trưa */}
                        <td className="px-2 py-3 text-center border-l border-gray-50 align-top bg-yellow-50/10">
                            <div className="flex flex-col items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-yellow-50 text-yellow-700 text-sm font-medium border border-yellow-100">
                                    {formatTime(log.checkOutTimeMorning)}
                                </span>
                                <ImageCell path={log.checkOutImageMorning} />
                            </div>
                        </td>

                        {/* Cột Vào Chiều */}
                        <td className="px-2 py-3 text-center border-l border-gray-50 align-top bg-orange-50/10">
                            <div className="flex flex-col items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 text-sm font-medium border border-orange-100">
                                    {formatTime(log.checkInTimeAfternoon)}
                                </span>
                                <ImageCell path={log.checkInImageAfternoon} />
                            </div>
                        </td>

                        {/* Cột Ra Về */}
                        <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                            <div className="flex flex-col items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 text-sm font-bold border border-red-100 shadow-sm">
                                    {formatTime(log.checkOutTime)}
                                </span>
                                <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                                    <ImageCell path={log.checkOutImage} />
                                </div>
                            </div>
                        </td>

                        {/* Cột Ghi chú / Trạng thái */}
                        <td className="px-6 py-4 whitespace-nowrap border-l border-gray-50 align-middle">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border
                                ${log.note && (log.note.includes('trễ') || log.note.includes('Vắng'))
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-2 
                                    ${log.note && (log.note.includes('trễ') || log.note.includes('Vắng')) ? 'bg-red-500' : 'bg-blue-500'}`
                                }></span>
                                {log.note || "Đang làm việc"}
                            </span>
                        </td>
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