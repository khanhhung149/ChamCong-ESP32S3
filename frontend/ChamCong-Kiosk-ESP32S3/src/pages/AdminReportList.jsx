import React, { useEffect, useState } from 'react';
import { api } from '../services/authServices.js';
import { TbCheck, TbAlertTriangle, TbRefresh, TbClock } from "react-icons/tb";

const AdminReportList = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/reports');
      setReports(res.data);
    } catch (err) {
      console.error("Lỗi tải báo cáo:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const markResolved = async (id) => {
    if(!window.confirm("Xác nhận đã xử lý xong sự cố này?")) return;
    try {
        await api.put(`/api/reports/${id}`, { 
            status: "Đã giải quyết", 
            admin_response: "Admin đã xử lý." 
        });
        fetchReports(); // Load lại danh sách
    } catch (err) {
        alert("Lỗi cập nhật trạng thái: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Quản lý sự cố</h1>
            <p className="text-gray-500 mt-1">
                Theo dõi và xử lý các vấn đề phát sinh từ hệ thống.
            </p>
        </div>
        
        <div className="flex items-center gap-3">
             <span className="bg-white px-3 py-1 rounded-full text-sm font-medium text-gray-600 border shadow-sm">
                Tổng: {reports.length}
             </span>
             <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold border border-red-200">
                Chờ xử lý: {reports.filter(r => r.status !== 'Đã giải quyết').length}
             </span>
             <button 
                onClick={fetchReports} 
                className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm transition"
            >
                <TbRefresh size={18}/> <span className="hidden sm:inline">Làm mới</span>
            </button>
        </div>
      </div>
      
      {/* 2. Content Grid */}
      {loading ? (
           <div className="p-10 text-center bg-white rounded-xl shadow-lg">
                <p className="text-gray-500 animate-pulse">Đang tải dữ liệu...</p>
           </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {reports.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-xl shadow-lg border border-gray-100">
                    <div className="inline-block p-4 rounded-full bg-green-50 text-green-500 mb-3">
                        <TbCheck size={40} />
                    </div>
                    <p className="text-gray-500 text-lg">Tuyệt vời! Hiện không có sự cố nào.</p>
                </div>
            ) : (
                reports.map((item) => (
                <div key={item._id} className={`flex flex-col justify-between p-6 rounded-xl shadow-sm border bg-white transition hover:shadow-lg hover:-translate-y-1 duration-200
                    ${item.status === 'Đang chờ' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500'}`}>
                    
                    <div>
                    {/* Card Header */}
                    <div className="flex justify-between items-start mb-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider
                            ${item.type === 'Phần cứng' ? 'bg-orange-100 text-orange-700' : 
                            item.type === 'Chấm công sai' ? 'bg-purple-100 text-purple-700' : 
                            item.type === 'Phần mềm' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                            {item.type}
                        </span>
                        <div className="flex items-center text-xs text-gray-400 gap-1">
                            <TbClock />
                            {new Date(item.createdAt).toLocaleString('vi-VN')}
                        </div>
                    </div>
                    
                    {/* User Info */}
                    <div className="mb-4">
                        <h3 className="font-bold text-gray-800 text-lg">{item.name}</h3>
                        <p className="text-xs text-gray-500 font-mono bg-gray-100 inline-block px-2 py-0.5 rounded">
                            {item.employee_id}
                        </p>
                    </div>

                    {/* Description */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4">
                        <p className="text-gray-700 text-sm leading-relaxed">
                            "{item.description}"
                        </p>
                    </div>
                    </div>

                    {/* Footer Status & Action */}
                    <div className="pt-4 border-t border-gray-100 mt-auto">
                        {item.status !== 'Đã giải quyết' ? (
                            <div className="flex justify-between items-center">
                                <span className="flex items-center text-red-500 text-sm font-bold animate-pulse">
                                    <TbAlertTriangle className="mr-1"/> {item.status}
                                </span>
                                <button 
                                    onClick={() => markResolved(item._id)}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 shadow-md transition flex items-center transform active:scale-95"
                                >
                                    <TbCheck className="mr-1" /> Xử lý xong
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center bg-green-50 py-2 rounded-lg text-green-700 text-sm font-bold border border-green-100">
                                <TbCheck className="mr-1" size={18}/> Đã giải quyết
                            </div>
                        )}
                    </div>

                </div>
                ))
            )}
        </div>
      )}
    </div>
  );
};

export default AdminReportList;