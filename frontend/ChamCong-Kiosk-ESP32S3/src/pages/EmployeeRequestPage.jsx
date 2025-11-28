import React, {useState, useEffect, use} from 'react'
import { api } from '../services/authServices.js'; // <-- Thêm
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

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Tạo yêu cầu mới</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Loại yêu cầu</label>
                        <select
                            value={requestType}
                            onChange={(e) => setRequestType(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                        >
                            <option>Nghỉ phép</option>
                            <option>Làm thêm giờ</option>
                            <option>Khác</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Lý do</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows="3"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="Nhập lý do chi tiết..."
                        />
                    </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="text-right">
                        <button type="submit" className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">
                            Gửi yêu cầu
                        </button>
                    </div>
        </form>
      </div>
      <div className="p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">Lịch sử yêu cầu</h2>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lý do</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày gửi</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="4" className="p-4 text-center">Đang tải...</td></tr>
                        ) : requests.map(req => (
                            <tr key={req._id}>
                                <td className="px-6 py-4 text-sm font-medium">{req.requestType}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{req.reason}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{new Date(req.createdAt).toLocaleDateString('vi-VN')}</td>
                                <td className="px-6 py-4 text-sm"><StatusBadge status={req.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
    </div>
  )
}

export default EmployeeRequestPage
