import React, { useState, useEffect } from 'react';
import { api } from '../services/authServices.js';
import authService from '../services/authServices.js';

const StatusBadge = ({ status }) => {
    let colorClass = 'bg-gray-200 text-gray-800';
    if (status === 'Đã duyệt') colorClass = 'bg-green-100 text-green-800';
    if (status === 'Từ chối') colorClass = 'bg-red-100 text-red-800';
    if (status === 'Chờ duyệt') colorClass = 'bg-yellow-100 text-yellow-800';
    return (
        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
            {status}
        </span>
    );
};

const ManagerRequestPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const currentUser = authService.getUser();
    const isManager = currentUser?.role === 'manager';
    const isAdmin = currentUser?.role === 'admin';

    const fetchAllRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/requests`);
            setRequests(res.data);
        } catch (e) { setError('Lỗi tải yêu cầu'); }
        setLoading(false);
    };

    useEffect(() => {
        fetchAllRequests();
    }, []);

    const handleUpdateRequest = async (id, status) => {
        try {
            await api.put(`/api/requests/${id}`, { status });
            setRequests(prev => prev.map(req => 
                req._id === id ? { ...req, status: status } : req
            ));
        } catch (e) {
            setError('Lỗi khi duyệt yêu cầu');
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">{isManager ? "Duyệt yêu cầu" : "Danh sách yêu cầu (Admin View)"}</h1>

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lý do</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày gửi</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                            
                            {isManager && (<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hành động</th>)}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="6" className="p-4 text-center">Đang tải...</td></tr>
                        ) : requests.map(req => (
                            <tr key={req._id}>
                                <td className="px-6 py-4 text-sm font-medium">{req.name} ({req.employee_id})</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{req.requestType}</td>
                                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{req.reason}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{new Date(req.createdAt).toLocaleDateString('vi-VN')}</td>
                                <td className="px-6 py-4 text-sm"><StatusBadge status={req.status} /></td>
                                {isManager && (
                                <td className="px-6 py-4 text-sm space-x-2">
                                    {req.status === 'Chờ duyệt' && (
                                        <>
                                            <button 
                                                onClick={() => handleUpdateRequest(req._id, 'Đã duyệt')}
                                                className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                                            >
                                                Duyệt
                                            </button>
                                            <button 
                                                onClick={() => handleUpdateRequest(req._id, 'Từ chối')}
                                                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                                            >
                                                Từ chối
                                            </button>
                                        </>
                                    )}
                                </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ManagerRequestPage;