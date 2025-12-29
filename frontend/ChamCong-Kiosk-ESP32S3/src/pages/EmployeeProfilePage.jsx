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
    account:'',
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
            account: userRes.data.account,
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
  
  if (loading) return <p className="text-center p-10">Đang tải...</p>;
  if (error) return <p className="text-red-500 text-center p-10">{error}</p>;
  if (!user) return <p className="text-center p-10">Không tìm thấy nhân viên.</p>;
  
  return (
       <div className="space-y-6">
      <Link to="/manager/employees" className="text-blue-600 hover:underline inline-flex items-center gap-1 mb-4">
        &larr; Quay lại Danh sách
      </Link>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cột trái: Thông tin cơ bản & Avatar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-8 bg-white rounded-xl shadow-lg text-center border border-gray-100">
            <div className="relative inline-block mb-4">
                <img 
                src={`${API_BASE_URL}${user.avatar_path || '/public/avatars/default.png'}`} 
                alt="Avatar"
                className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-md"
                />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{user.name}</h2>
            <p className="text-gray-500 text-sm mb-2">{user.account}</p>
            
            <div className="flex justify-center gap-2 mb-4">
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-mono font-bold border border-gray-200">
                    {user.employee_id}
                </span>
                
                {/* [SỬA] Hiển thị Role tiếng Việt với màu xanh */}
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border
                    ${user.role === 'manager' || user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-700 border-purple-200' // Màu tím cho Quản lý
                        : 'bg-green-100 text-green-700 border-green-200'   // Màu xanh cho Nhân viên
                    }`}>
                    {user.role === 'manager' ? 'Quản lý' : user.role === 'admin' ? 'Admin' : 'Nhân viên'}
                </span>
            </div>
          </div>
        </div>

        {/* Cột phải: Form sửa & Lịch sử chấm công */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Form Cập nhật */}
            <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-50">
                    <h3 className="text-lg font-bold text-gray-800">Thông tin chi tiết</h3>
                    <button 
                        onClick={() => setIsEditing(!isEditing)} 
                        className={`text-sm px-3 py-1 rounded font-medium transition
                            ${isEditing ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                    >
                        {isEditing ? 'Hủy bỏ' : 'Chỉnh sửa'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {/* Hiển thị dạng Text nếu không Edit */}
                    {!isEditing ? (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Họ và tên</label>
                                <p className="text-gray-800 font-medium bg-gray-50 p-2 rounded border border-gray-100">{user.name}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Mã Nhân viên</label>
                                <p className="text-gray-800 font-medium bg-gray-50 p-2 rounded border border-gray-100 font-mono">{user.employee_id}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tài khoản</label>
                                <p className="text-gray-800 font-medium bg-gray-50 p-2 rounded border border-gray-100">{user.account}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Chức vụ</label>
                                <p className="text-gray-800 font-medium bg-gray-50 p-2 rounded border border-gray-100">
                                    {user.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                                </p>
                            </div>
                        </>
                    ) : (
                        // Form Edit khi bấm nút Sửa
                        <form id="editForm" onSubmit={handleUpdateUser} className="contents">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên Nhân viên</label>
                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mã Nhân viên</label>
                                <input type="text" name="employee_id" value={formData.employee_id} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-100 cursor-not-allowed" readOnly/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản</label>
                                <input type="text" name="account" value={formData.account} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phân quyền</label>
                                <select name="role" value={formData.role} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                    <option value="employee">Nhân viên</option>
                                    <option value="manager">Quản lý</option>
                                </select>
                            </div>
                        </form>
                    )}
                </div>
                
                {isEditing && (
                    <div className="text-right mt-6 pt-4 border-t border-gray-100">
                        <button type="submit" form="editForm" className="px-6 py-2 font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition transform active:scale-95">
                            Lưu Thay đổi
                        </button>
                    </div>
                )}
            </div>

            {/* Bảng chấm công */}
            <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    Lịch sử Chấm công
                    <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">30 ngày gần nhất</span>
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Giờ vào</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ảnh</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Giờ ra</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ảnh</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {logs.length === 0 ? (
                            <tr><td colSpan="5" className="p-4 text-center text-gray-400 italic">Chưa có dữ liệu chấm công.</td></tr>
                        ) : logs.map(log => (
                        <tr key={log._id} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3 text-sm font-medium text-gray-700">{new Date(log.date).toLocaleDateString('vi-VN')}</td>
                            <td className="px-4 py-3 text-sm font-bold text-green-600 bg-green-50 rounded-lg">{formatTime(log.checkInTime)}</td>
                            <td className="px-4 py-3"><ImageCell path={log.checkInImage} /></td>
                            <td className="px-4 py-3 text-sm font-bold text-red-600 bg-red-50 rounded-lg">{formatTime(log.checkOutTime)}</td>
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