import React, { useEffect, useState} from 'react'
import { api } from '../services/authServices.js';
import { API_BASE_URL } from '../config.js';
import { saveAs } from 'file-saver';

const PaginationControls = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
    }

    return (
        <div className="flex justify-center items-center space-x-2 mt-6">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 font-medium bg-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-300"
            >
                Trước
            </button>

            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => onPageChange(number)}
                    className={`px-4 py-2 rounded-md font-medium ${currentPage === number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                >
                    {number}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-4 py-2 font-medium bg-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-300"
            >
                Tiếp
            </button>
        </div>
    );
};
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

const ReportPage = () => {
    const [logs, setLogs] =useState([]);
    const [loading, setLoading] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [isExporting, setIsExporting] = useState(false);

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
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Báo cáo Chấm công</h1>

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Bộ lọc báo cáo</h2>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700">Từ ngày</label>
                        <input 
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        type="date" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700">Đến ngày</label>
                        <input 
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        type="date" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"/>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={handleFilterClick}
                            disabled={loading}
                            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {loading ? 'Đang tải...' : 'Lọc Báo cáo'}
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="px-4 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                        >
                            {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã NV</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ vào</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh vào</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ ra</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh ra</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tổng giờ</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {logs.map(log => (
                                <tr key={log._id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{log.name}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{log.employee_id}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(log.date).toLocaleDateString('vi-VN')}</td>
                                    <td className="px-6 py-4 text-sm text-green-600 font-semibold">{formatTime(log.checkInTime)}</td>
                                    <td className="px-6 py-4"><ImageCell path={log.checkInImage} /></td>
                                    <td className="px-6 py-4 text-sm text-red-600 font-semibold">{formatTime(log.checkOutTime)}</td>
                                    <td className="px-6 py-4"><ImageCell path={log.checkOutImage} /></td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{log.totalHours ? `${log.totalHours} h` : '...'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                />
            </div>
        </div>
    );
}

export default ReportPage
