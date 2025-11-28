import React, {useState, useEffect} from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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

const EmployeeProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    name:'',
    email:'',
    employee_id:'',
    role:'employee'
  });
  const [isEditing, setIsEditing] = useState(false);
  

  const fetchData =async() =>{
    setLoading(true);
    try{
        const userRes = await api.get(`/api/users/${id}`);
        setUser(userRes.data);
        setFormData({
            name: userRes.data.name,
            email: userRes.data.email,
            employee_id: userRes.data.employee_id,
            role: userRes.data.role,
        });
        
        const logRes = await api.get(`/api/users/${id}/logs`);
        setLogs(logRes.data);
    }
    catch(error){   
        setError('Lỗi khi tải dữ liệu');
    }
    setLoading(false);
  };

  useEffect(() =>{
    fetchData();
  }, [id]);


  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
        const res = await api.put(`/api/users/${id}`, formData);
        setUser(res.data);
        setIsEditing(false); 
        setError('');
    } catch (err) {
        setError('Lỗi khi cập nhật thông tin');
    }
  };

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  if (loading) return <p>Đang tải...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!user) return <p>Không tìm thấy nhân viên.</p>;
  
  return (
       <div className="space-y-6">
      <Link to="/manager/employees" className="text-blue-600 hover:underline">&larr; Quay lại Danh sách</Link>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 bg-white rounded-xl shadow-lg text-center">
            <img 
              src={`http://localhost:5000${user.avatar_path || '/public/avatars/default.png'}`} 
              alt="Avatar"
              className="w-40 h-40 rounded-full mx-auto mb-4 object-cover border-4 border-gray-200"
            />
            <h2 className="text-2xl font-semibold">{user.name}</h2>
            <p className="text-gray-500">{user.email}</p>
            <p className="text-gray-500">Mã NV: {user.employee_id}</p>
          </div>

          
        </div>

        <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-white rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold">Cập nhật Thông tin</h3>
                    <button onClick={() => setIsEditing(!isEditing)} className="text-sm text-blue-600">
                        {isEditing ? 'Hủy' : 'Sửa'}
                    </button>
                </div>

                {isEditing && (
                    <form onSubmit={handleUpdateUser} className="space-y-4 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tên Nhân viên</label>
                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Mã Nhân viên</label>
                                <input type="text" name="employee_id" value={formData.employee_id} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Email</label>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Phân quyền</label>
                                <select name="role" value={formData.role} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white">
                                    <option value="employee">Employee</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                        </div>
                        <div className="text-right">
                            <button type="submit" className="px-4 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Lưu Thay đổi</button>
                        </div>
                    </form>
                )}
            </div>

            <div className="p-6 bg-white rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold mb-3">Lịch sử Chấm công Gần đây</h3>
                <div className="overflow-y-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ vào</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh vào</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giờ ra</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ảnh ra</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {logs.map(log => (
                        <tr key={log._id}>
                            <td className="px-4 py-3 text-sm">{new Date(log.date).toLocaleDateString('vi-VN')}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatTime(log.checkInTime)}</td>
                            <td className="px-4 py-3"><ImageCell path={log.checkInImage} /></td>
                            <td className="px-4 py-3 text-sm font-semibold text-red-600">{formatTime(log.checkOutTime)}</td>
                            <td className="px-4 py-3"><ImageCell path={log.checkOutImage} /></td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
        </div>
    </div>
  )
}

export default EmployeeProfilePage
