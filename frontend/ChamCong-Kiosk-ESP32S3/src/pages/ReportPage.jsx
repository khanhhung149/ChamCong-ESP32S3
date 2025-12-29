import React, { useEffect, useState} from 'react'
import { api } from '../services/authServices.js';
import { API_BASE_URL } from '../config.js';
import { saveAs } from 'file-saver';
import authService from '../services/authServices.js';
import { FaFileExcel, FaSearch, FaFilter } from "react-icons/fa";

const PaginationControls = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;
    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);

    return (
        <div className="flex justify-center items-center gap-2 mt-6">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
                Trước
            </button>
            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => onPageChange(number)}
                    className={`w-8 h-8 rounded flex items-center justify-center text-sm font-medium transition-all ${
                        currentPage === number
                            ? 'bg-blue-600 text-white shadow-md transform scale-105'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    {number}
                </button>
            ))}
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
                Tiếp
            </button>
        </div>
    );
};
const ImageCell = ({ path }) => {
    if (!path) return <span className="text-gray-300 text-[10px] block mt-1">-</span>;
    return (
        <a href={`${API_BASE_URL}${path}`} target="_blank" rel="noopener noreferrer" className="block mt-1 group relative">
            <div className="w-10 h-10 mx-auto rounded overflow-hidden border border-gray-200 shadow-sm group-hover:ring-2 group-hover:ring-blue-400 transition-all">
                <img 
                    src={`${API_BASE_URL}${path}`} 
                    alt="Proof" 
                    className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300"
                />
            </div>
            {/* Tooltip hint */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-black text-white text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                Xem ảnh
            </span>
        </a>
    );
};

const formatTime = (dateTimeString) => {
    if (!dateTimeString) return '...';
    return new Date(dateTimeString).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const ReportPage = () => {
    const [logs, setLogs] =useState([]);
    const [loading, setLoading] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [isExporting, setIsExporting] = useState(false);

    const currentUser = authService.getUser();
    const isAdmin = currentUser?.role === 'admin';

    const fetchLogs = async(page = 1)=>{
        setLoading(true);
        try{
            const response = await api.get('/api/logs', {
                params: {
                    startDate: startDate || null, 
                    endDate: endDate || null,
                    page: page
                }
            });
            setLogs(response.data.logs);
            setCurrentPage(response.data.currentPage);
            setTotalPages(response.data.totalPages);
        }
        catch(error){
            console.log(error);
        }
        setLoading(false);
    };

    useEffect(() =>{fetchLogs(1);},[]);

    const handleFilterClick = () => {
        fetchLogs(1);
    };
    
    const handlePageChange = (newPage) => {
        if (newPage > 0 && newPage <= totalPages) {
            fetchLogs(newPage);
        }
    };

    const handleExport = async () => {
        setIsExporting(true); 
        try {
            const response = await api.get('/api/logs/export', {
                params: {
                    startDate: startDate || null,
                    endDate: endDate || null,
                },
                responseType: 'blob' 
            });

            let fileName = 'BaoCaoChamCong.xlsx'; 

            if (startDate && endDate) {
                fileName = `BaoCao_${startDate}_den_${endDate}.xlsx`;
            } else if (startDate) {
                fileName = `BaoCao_tu_${startDate}.xlsx`;
            } else if (endDate) {
                fileName = `BaoCao_den_${endDate}.xlsx`;
            }

            saveAs(new Blob([response.data]), fileName);

        } catch (error) {
            console.error("Lỗi khi xuất Excel:", error);
            alert("Không thể xuất file Excel.");
        }
        setIsExporting(false);
    };
  return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-800">
                    {isAdmin ? "Quản lý chấm công" : "Báo cáo chấm công"}
                </h1>
                
                {/* Nút Xuất Excel */}
                {!isAdmin && (
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        {isExporting ? <span className="animate-spin"></span> : <FaFileExcel />}
                        {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
                    </button>
                )}
            </div>

            {/* --- Bộ Lọc --- */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="w-full sm:w-auto flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Từ ngày</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="w-full sm:w-auto flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Đến ngày</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <button
                        onClick={handleFilterClick}
                        disabled={loading}
                        className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <FaSearch size={14} />
                        Lọc dữ liệu
                    </button>
                </div>
            </div>

            {/* --- Bảng Dữ Liệu --- */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-bold">
                                <th className="px-6 py-4 text-left">Nhân viên</th>
                                <th className="px-2 py-4 text-center border-l border-gray-100 text-green-700">Vào Sáng</th>
                                <th className="px-2 py-4 text-center border-l border-gray-100 text-yellow-700">Ra Trưa</th>
                                <th className="px-2 py-4 text-center border-l border-gray-100 text-orange-700">Vào Chiều</th>
                                <th className="px-2 py-4 text-center border-l border-gray-100 text-red-700">Ra Về</th>
                                <th className="px-4 py-4 text-left border-l border-gray-100">Trạng thái</th>
                                <th className="px-4 py-4 text-center border-l border-gray-100 text-blue-700">Tổng giờ</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan="7" className="p-10 text-center text-gray-500 italic">Đang tải dữ liệu...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="7" className="p-10 text-center text-gray-500">Không tìm thấy dữ liệu nào.</td></tr>
                            ) : logs.map((log) => (
                                <tr key={log._id} className="hover:bg-blue-50 transition-colors duration-150">
                                    {/* Cột 1: Thông tin NV */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">{log.name}</span>
                                            <span className="text-xs text-gray-500 font-mono">{log.employee_id}</span>
                                            <span className="text-[10px] text-gray-400 mt-1">{new Date(log.date).toLocaleDateString('vi-VN')}</span>
                                        </div>
                                    </td>

                                    {/* Cột 2: Vào Sáng */}
                                    <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                                        <div className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded inline-block">
                                            {formatTime(log.checkInTime)}
                                        </div>
                                        <ImageCell path={log.checkInImage} />
                                    </td>

                                    {/* Cột 3: Ra Trưa */}
                                    <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                                        <div className="text-sm font-medium text-gray-600 bg-yellow-50 px-2 py-0.5 rounded inline-block">
                                            {formatTime(log.checkOutTimeMorning)}
                                        </div>
                                        <ImageCell path={log.checkOutImageMorning} />
                                    </td>

                                    {/* Cột 4: Vào Chiều */}
                                    <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                                        <div className="text-sm font-medium text-gray-600 bg-orange-50 px-2 py-0.5 rounded inline-block">
                                            {formatTime(log.checkInTimeAfternoon)}
                                        </div>
                                        <ImageCell path={log.checkInImageAfternoon} />
                                    </td>

                                    {/* Cột 5: Ra Về */}
                                    <td className="px-2 py-3 text-center border-l border-gray-50 align-top">
                                        <div className="text-sm font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded inline-block">
                                            {formatTime(log.checkOutTime)}
                                        </div>
                                        <ImageCell path={log.checkOutImage} />
                                    </td>

                                    {/* Cột 6: Ghi chú */}
                                    <td className="px-4 py-4 border-l border-gray-50 align-middle">
                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold
                                            ${log.note && (log.note.includes('trễ') || log.note.includes('Vắng')) 
                                                ? 'bg-red-100 text-red-800 border border-red-200' 
                                                : 'bg-green-100 text-green-800 border border-green-200'}`}>
                                            {log.status || "Check-in"}
                                        </span>
                                        {log.note && (
                                            <p className="text-xs text-gray-500 mt-1.5 max-w-[180px] truncate" title={log.note}>
                                                {log.note}
                                            </p>
                                        )}
                                    </td>

                                    {/* Cột 7: Tổng giờ */}
                                    <td className="px-4 py-4 text-center border-l border-gray-50 align-middle">
                                        <span className="text-sm font-bold text-blue-600">{log.totalHours ? `${log.totalHours}h` : '-'}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer Bảng & Phân trang */}
                <div className="bg-gray-50 p-4 border-t border-gray-200">
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                    />
                </div>
            </div>
        </div>
    );
}

export default ReportPage
