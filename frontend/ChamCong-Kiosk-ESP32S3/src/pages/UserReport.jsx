import React, { useState, useEffect } from 'react';
import authService, { api } from '../services/authServices.js';
import { TbAlertTriangle, TbSend, TbHistory, TbMessageCheck, TbClock, TbRefresh } from "react-icons/tb";

const UserReport = () => {
  const [formData, setFormData] = useState({
    employee_id: "",
    name: "",
    type: "Phần cứng",
    description: ""
  });
  const [loading, setLoading] = useState(false);
  const [myReports, setMyReports] = useState([]);

  // Hàm tải lịch sử
  const fetchMyReports = async () => {
    try {
        const res = await api.get('/api/reports/my');
        setMyReports(res.data);
    } catch (err) {
        console.error("Lỗi tải lịch sử báo cáo", err);
    }
  };

  useEffect(() => {
    const user = authService.getUser();
    if (user) {
      setFormData(prev => ({
        ...prev,
        employee_id: user.employee_id,
        name: user.name
      }));
    }
    fetchMyReports();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/reports', formData);
      alert("✅ Đã gửi báo cáo thành công!");
      setFormData(prev => ({ ...prev, description: "" })); 
      fetchMyReports();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      alert("❌ Lỗi: " + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 h-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-800">Báo cáo sự cố</h1>
            <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
                Help Center
            </span>
        </div>
        <button onClick={fetchMyReports} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition inline-flex items-center gap-1 cursor-pointer" title="Làm mới lịch sử">
            <TbRefresh size={16} />Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 sticky top-4">
            <div className="mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                    <TbAlertTriangle className="text-orange-500" size={24} />
                    Gửi yêu cầu mới
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                    Nhập thông tin sự cố để Admin hỗ trợ.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-lg font-bold text-gray-500 uppercase mb-1">Mã NV</label>
                        <input type="text" value={formData.employee_id} disabled className="w-full bg-gray-50 border border-gray-200 p-2 rounded text-gray-600 font-mono text-sm" />
                    </div>
                    <div>
                        <label className="block text-lg font-bold text-gray-500 uppercase mb-1">Tên</label>
                        <input type="text" value={formData.name} disabled className="w-full bg-gray-50 border border-gray-200 p-2 rounded text-gray-600 text-sm" />
                    </div>
                </div>

                <div>
                    <label className="block text-lg font-bold text-gray-700 mb-1">Loại sự cố <span className="text-red-500">*</span></label>
                    <select 
                        className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white transition"
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                    >
                        <option value="Phần cứng">Lỗi thiết bị (Camera/Wifi)</option>
                        <option value="Phần mềm">Lỗi App/Website</option>
                        <option value="Chấm công sai">Chấm công sai/Thiếu công</option>
                        <option value="Khác">Vấn đề khác</option>
                    </select>
                </div>

                <div>
                    <label className="block text-lg font-bold text-gray-700 mb-1">Mô tả chi tiết <span className="text-red-500">*</span></label>
                    <textarea 
                        className="w-full border border-gray-300 p-3 rounded-lg h-32 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-700"
                        placeholder="Mô tả rõ vấn đề bạn gặp phải..."
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        required
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white font-bold transition shadow-md active:scale-95
                        ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {loading ? "Đang gửi..." : <><TbSend size={20} /> Gửi Ngay</>}
                </button>
            </form>
        </div>

        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-2 border-b border-gray-200">
                <TbHistory className="text-blue-600" /> 
                Lịch sử ({myReports.length})
            </h2>

            {myReports.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-400">Chưa có báo cáo nào gần đây.</p>
                </div>
            ) : (
                <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 custom-scrollbar">
                    {myReports.map((report) => (
                        <div key={report._id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
                            <div className="flex justify-between items-start mb-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                                    ${report.type === 'Phần cứng' ? 'bg-orange-100 text-orange-700' : 
                                      report.type === 'Chấm công sai' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {report.type}
                                </span>
                                <span className={`flex items-center gap-1 text-xs font-bold
                                    ${report.status === 'Đã giải quyết' ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {report.status === 'Đã giải quyết' ? <TbMessageCheck /> : <TbClock />}
                                    {report.status}
                                </span>
                            </div>

                            <p className="text-gray-800 text-sm font-medium mb-1">"{report.description}"</p>
                            <p className="text-xs text-gray-400 mb-3">
                                {new Date(report.createdAt).toLocaleString('vi-VN')}
                            </p>

                            {(report.admin_response || report.status === 'Đã giải quyết') && (
                                <div className="bg-green-50 border-l-4 border-green-500 p-2 rounded-r-md">
                                    <p className="text-xs font-bold text-green-800 flex items-center gap-1 mb-0.5">
                                        <TbMessageCheck size={14} /> Phản hồi từ Admin:
                                    </p>
                                    <p className="text-green-700 text-sm">
                                        {report.admin_response || "Đã xử lý xong."}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default UserReport;