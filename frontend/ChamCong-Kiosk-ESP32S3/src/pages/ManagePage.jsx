import React, {useState, useEffect} from 'react'
import { Link } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import { api } from '../services/authServices.js';
import authService from '../services/authServices.js';

const Button= ({children, onClick, className='', type='button'}) =>(
    <button type={type} onClick={onClick} className={`px-4 py-2 font-semibold text-white transition-colors duration-200 rounded-md ${className}`}>
        {children}
    </button>
)
const StatusBadge =({status}) =>{
    let colorClass = 'bg-gray-500';
    if(status.includes('Online')) colorClass = 'bg-green-500';
    if(status.includes('Lỗi') || status.includes('Offline')) colorClass = 'bg-red-500';
    return (
        <span className={`px-3 py-1 text-sm font-medium text-white rounded-full ${colorClass}`}>
            {status}
        </span>
    );
}

const ManagePage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const currentUser = authService.getUser(); 
    const isAdmin = currentUser?.role === 'admin';
    
    const { deviceCount, lastTextMessage, sendWsMessage, isWsReady } = useWebSocket();
    const [adminWsStatus, setAdminWsStatus] = useState('Đang kết nối Server...');

    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollStatusText, setEnrollStatusText] = useState('');

    const [formData, setFormData]= useState({
        name:'',
        // employee_id:'',
        account:'',
        password:'',
        role:'employee'
    });

    useEffect(() => {
        if (lastTextMessage === 'auth:success') {
            setAdminWsStatus('Đã kết nối Server');
        } else if (lastTextMessage.startsWith('progress:')) {
            const parts = lastTextMessage.split(':');
            const statusMsg = `Đang đăng ký ${parts[1]}... (${parts[2]})`;
            
            setAdminWsStatus(statusMsg);
            setIsEnrolling(true);
            setEnrollStatusText(statusMsg);
        } else if (lastTextMessage.startsWith('enroll_done:')) {
            const parts = lastTextMessage.split(':');
            const statusMsg = `Đăng ký Hoàn tất cho ${parts[1]} (${parts[2]})!`;

            setAdminWsStatus('Đăng ký Hoàn tất!');

            setEnrollStatusText(statusMsg); 
            
            setTimeout(() => {
                setIsEnrolling(false);
                setEnrollStatusText('');
                setAdminWsStatus('Đã kết nối Server');
            }, 3000);
        } 
    }, [lastTextMessage]);

    const fetchUsers = async()=>{
        setLoading(true);
        try{
            const response = await api.get('/api/users');
            setUsers(response.data);
        }
        catch(error){
            setError('Lỗi khi tải danh sách nhân viên.');
            console.log(error);
        }
        setLoading(false);
    }

    useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (userId, name, employeeId) => {
    // 1. Hỏi xác nhận
    if (!window.confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`)) return;

    // 2. Gửi lệnh xóa xuống thiết bị qua WebSocket (Dùng hàm từ hook của bạn)
    if (isWsReady) {
      sendWsMessage(`delete:${employeeId}`); // <--- Dùng hàm này thay vì ws.send
    } else {
      console.warn("WS chưa sẵn sàng, lệnh xóa trên thiết bị có thể bị trễ");
    }

    // 3. Gọi API xóa Backend (Xóa DB, xóa ảnh)
    try {
      // Gọi API xóa user (Backend sẽ lo việc xóa file ảnh và DB)
      const res = await api.delete(`/api/users/${userId}`); 
      
      if (res.data.success) {
        // Cập nhật lại danh sách trên giao diện
        setUsers(prevUsers => prevUsers.filter(user => user._id !== userId));
        // alert("Đã xóa thành công!"); // Hoặc dùng toast nếu có
      }
    } catch (error) {
      console.error("Lỗi khi xóa nhân viên:", error);
        alert(error.response?.data?.message || 'Lỗi khi xóa nhân viên');
    }
  };

  const handleInputChange = (e) =>{
    const {name, value} = e.target;
    setFormData((prev) =>({
        ...prev,
        [name]:value,
    }));
  }

  const handleSubmit = async(e) =>{
    e.preventDefault();
    if(!formData.account || !formData.password || !formData.name){
        setError('Vui lòng điền tất cả các trường thông tin bắt buộc.');
        return;
    }
    try{
        const res = await api.post('/api/users', formData);
            setUsers(prevUsers => [res.data, ...prevUsers]);
            setFormData({
                name:'', account:'', password:'', role:'employee'
            });
            setError('');
    }
    catch(error){
        setError('Lỗi khi thêm nhân viên');
        console.log(error);

    }
  }


    const handleEnroll = (user) => {
        if (deviceCount === 0) {
            alert('Device đang Offline! Không thể gửi lệnh.');
            return;
        }
        
        let confirmMsg = `Bạn muốn kích hoạt Device để đăng ký khuôn mặt cho ${user.name} (${user.employee_id})?`;
        
        // Cảnh báo nếu đã đăng ký rồi
        if (user.is_enrolled) {
            confirmMsg = `⚠️ CẢNH BÁO: Nhân viên ${user.name} ĐÃ CÓ dữ liệu khuôn mặt.\n\nBạn có chắc chắn muốn ĐĂNG KÝ LẠI (ghi đè dữ liệu cũ) không?`;
        }

        if (window.confirm(confirmMsg)) {
            setAdminWsStatus(`Đang gửi lệnh enroll cho ${user.employee_id}...`);
            sendWsMessage(`enroll:${user.employee_id}`);
        }
    };


    const LoadingModal = ({ text }) => (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-xl">
                <div className="w-12 h-12 border-4 border-t-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <span className="text-lg font-medium text-gray-700">{text}</span>
            </div>
        </div>
    );

    const rolePrefix = isAdmin ? '/admin' : '/manager';
  return (
        <div className='space-y-6'>
            {isEnrolling && <LoadingModal text={enrollStatusText} />}

            <div className="flex items-center justify-between">
                <h1 className='text-3xl font-bold text-gray-800'>
                    {isAdmin ? "Quản trị Hệ thống (Admin)" : "Quản lý Nhân viên"}
                </h1>
                <StatusBadge status={deviceCount > 0 ? `Device Online (${deviceCount})` : 'Device Offline'} />
            </div>

            {/* ĐÃ XÓA CÁC NÚT CLEAR DB & DUMP DB TẠI ĐÂY */}

            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-5 text-gray-700'>Thêm Nhân viên mới</h2>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Tên nhân viên *</label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange}
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' />
                        </div>
                        {/* <div>
                            <label className='block text-sm font-medium text-gray-700'>Email</label>
                            <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' />
                        </div> */}
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Tên tài khoản *</label>
                            <input
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' type="text" name="account" value={formData.account} onChange={handleInputChange} />
                        </div>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Mật khẩu *</label>
                            <input className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' type="password" name="password" value={formData.password} onChange={handleInputChange} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Phân quyền *</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleInputChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="employee">Nhân viên</option>

                                {/* [SỬA LẠI] Chỉ Admin mới thấy quyền Manager và Admin */}
                                {isAdmin && (
                                    <>
                                        <option value="manager">Quản lý</option>
                                    </>
                                )}
                            </select>
                        </div>
                    </div>
                    {error && (
                        <p className="text-sm text-red-600 mt-2">{error}</p>
                    )}
                    <div className="text-right pt-2">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                            Lưu Nhân viên
                        </Button>
                    </div>
                </form>
            </div>

            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-4 text-gray-700'>Danh sách nhân viên</h2>
                {loading ? (
                    <p>Đang tải danh sách...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className='min-w-full divide-y divide-gray-200'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Mã NV</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Tên</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Tên tài khoản</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Chức vụ</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Trạng thái</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Hành động</th>
                                </tr>
                            </thead>
                            <tbody className='bg-white divide-y divide-gray-200'>
                                {users.map(user => (
                                    <tr key={user._id} className='hover:bg-gray-50'>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>{user.employee_id}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>
                                            <span className="text-gray-900">{user.name}</span>
                                        </td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{user.account}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                            {user.role === 'admin' ? (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">Admin</span>
                                            ) : user.role === 'manager' ? (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Quản lý</span>
                                            ) : (
                                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Nhân viên</span>
                                            )}
                                        </td>

                                        <td className='px-6 py-4 whitespace-nowrap text-sm'>
                                            {user.is_enrolled ? (
                                                <span className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                                                    Đã có dữ liệu
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-200 rounded-full">
                                                    Chưa đăng ký
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            {/* Nút đăng ký thông minh */}
                                            {isAdmin && (
                                                <Link to={`${rolePrefix}/employees/${user._id}`}>
                                                    <Button className='bg-blue-500 hover:bg-blue-600 text-xs'>
                                                        Sửa
                                                    </Button>
                                                </Link>
                                            )}
                                            <Button 
                                                className={`text-xs ${user.is_enrolled ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'}`} 
                                                onClick={() => handleEnroll(user)}
                                            >
                                                {user.is_enrolled ? 'Đăng ký lại' : 'Đăng ký'}
                                            </Button>
                                            
                                            {isAdmin && (
                                                <Button className='bg-red-600 hover:bg-red-700 text-xs' onClick={() => handleDelete(user._id, user.name, user.employee_id)}>
                                                    Xóa
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ManagePage
