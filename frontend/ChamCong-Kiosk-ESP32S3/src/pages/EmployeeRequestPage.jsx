import React, {useState, useEffect, use} from 'react'
import { api } from '../services/authServices.js';
const StatusBadge =({status}) =>{
  let colorClass ='bg-gray-200 text-gray-800';
  if(status ==='Đã duyệt') colorClass ='bg-green-100 text-green-800';
  if(status ==='Từ chối') colorClass ='bg-red-100 text-red-800';
  if(status ==='Chờ duyệt') colorClass ='bg-yellow-100 text-yellow-800';
  return(
    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>
      {status}
    </span>
  )
};

const EmployeeRequestPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading ] = useState(true);
  const [error, setError] = useState('');

  const [requestType, setRequestType] =useState('Nghỉ phép');
  const [reason, setReason] =useState('');

  const fetchMyRequests = async() =>{
    setLoading(true);
    try{
      const res = await api.get(`/api/requests/my`);
      setRequests(res.data);
    }
    catch(error){
      setError('Lỗi khi tải yêu cầu');
    }
    setLoading(false);
  };

  useEffect(()=>{
    fetchMyRequests();
  },[]);

  const handleSubmit =async(e) =>{
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
        setError('Vui lòng nhập lý do (reason).');
        return;
    }
    try{
      await api.post(`/api/requests`, {requestType, reason});
      setReason('');
      fetchMyRequests();
    }
    catch(error){
      setError('Lỗi khi gửi yêu cầu');
    }
  }
  return (
    <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Yêu cầu của tôi</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 sticky top-4">
                <h2 className="text-xl font-semibold mb-4 text-gray-700 border-b pb-2">Tạo yêu cầu mới</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Loại yêu cầu</label>
                        <select
                            value={requestType}
                            onChange={(e) => setRequestType(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option>Nghỉ phép</option>
                            <option>Làm thêm giờ</option>
                            <option>Công tác</option>
                            <option>Khác</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Lý do chi tiết</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows="4"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
                            placeholder="Ví dụ: Xin nghỉ phép 1 ngày do việc gia đình..."
                        />
                    </div>
                    
                    {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
                    
                    <button type="submit" className="w-full px-4 py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition shadow-md">
                        Gửi yêu cầu
                    </button>
                </form>
            </div>

            <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="text-xl font-semibold text-gray-700">Lịch sử ({requests.length})</h2>
                </div>
                
                <div className="overflow-auto max-h-[500px]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Loại</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Lý do</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Ngày gửi</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan="4" className="p-4 text-center text-gray-500">Đang tải...</td></tr>
                            ) : requests.length === 0 ? (
                                <tr><td colSpan="4" className="p-4 text-center text-gray-400 italic">Chưa có yêu cầu nào.</td></tr>
                            ) : requests.map(req => (
                                <tr key={req._id} className="hover:bg-gray-50 transition">
                                    <td className="px-4 py-3 text-sm font-medium text-blue-600">{req.requestType}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate" title={req.reason}>{req.reason}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(req.createdAt).toLocaleDateString('vi-VN')}</td>
                                    <td className="px-4 py-3 text-sm"><StatusBadge status={req.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  )
}

export default EmployeeRequestPage
