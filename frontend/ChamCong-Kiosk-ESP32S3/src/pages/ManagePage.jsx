import React, {useState, useEffect} from 'react'
import { Link } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext.jsx';
import { api } from '../services/authServices.js';

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
    
    const { kioskCount, lastTextMessage, sendWsMessage, isWsReady } = useWebSocket();
    const [adminWsStatus, setAdminWsStatus] = useState('Đang kết nối Server...');

    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollStatusText, setEnrollStatusText] = useState('');

    const [formData, setFormData]= useState({
        name:'',
        // employee_id:'',
        email:'',
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
        } else if (lastTextMessage === 'db_cleared') {
            alert('Database trên Kiosk đã bị xóa!');
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

  const handleDelete = async(userId, name) =>{
    if(window.confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`)){
    try{
        await api.delete(`/api/users/${userId}`);
        setUsers(prevUsers => prevUsers.filter(user => user._id !== userId));
    }
    catch(error){
        setError('Lỗi khi xóa nhân viên');
        console.log(error);
    }
    }
  }

  const handleInputChange = (e) =>{
    const {name, value} = e.target;
    setFormData((prev) =>({
        ...prev,
        [name]:value,
    }));
  }

  const handleSubmit = async(e) =>{
    e.preventDefault();
    if(!formData.email || !formData.password || !formData.name){
        setError('Vui lòng điền tất cả các trường thông tin bắt buộc.');
        return;
    }
    try{
        const res = await api.post('/api/users', formData);
            setUsers(prevUsers => [res.data, ...prevUsers]);
            setFormData({
                name:'', email:'', password:'', role:'employee'
            });
            setError('');
    }
    catch(error){
        setError('Lỗi khi thêm nhân viên');
        console.log(error);

    }
  }


    const handleEnroll = (employeeId) => {
        if (kioskCount === 0) {
            alert('Kiosk đang Offline! Không thể gửi lệnh.');
            return;
        }
        if (!employeeId) {
            alert('Lỗi: Nhân viên này chưa có Mã NV (employee_id).');
            return;
        }
        if (window.confirm(`Bạn có muốn kích hoạt Kiosk để đăng ký khuôn mặt cho ${employeeId}?`)) {
            setAdminWsStatus(`Đang gửi lệnh enroll cho ${employeeId}...`);
            sendWsMessage(`enroll:${employeeId}`);
        }
    };

    const handleClearKioskDB = async () => {
        if (kioskCount === 0) {
            alert('Kiosk đang Offline! Không thể gửi lệnh.');
            return;
        }
        if (window.confirm('CẢNH BÁO: Bạn có CHẮC muốn XÓA HẾT khuôn mặt trên Kiosk VÀ reset trạng thái database?')) {
            try {
                sendWsMessage('delete_all');
                await api.post('/api/users/reset-all-enrollment');
                alert('Đã xóa DB Kiosk và reset trạng thái server.');

                fetchUsers(); 
            } catch (error) {
                alert('Có lỗi xảy ra khi reset server: ' + error.message);
            }
        }
    };
    const handleDumpDB = () => {
        if (kioskCount === 0) {
            alert('Kiosk đang Offline! Không thể gửi lệnh.');
            return;
        }
        sendWsMessage('dump_db');
    };

    const LoadingModal = ({ text }) => (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-xl">
                <div className="w-12 h-12 border-4 border-t-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <span className="text-lg font-medium text-gray-700">{text}</span>
            </div>
        </div>
    );
  return (
        <div className='space-y-6'>

            {console.log("RENDER: isEnrolling =", isEnrolling)}
            {isEnrolling && <LoadingModal text={enrollStatusText} />}

            <div className="flex items-center justify-between">
                <h1 className='text-3xl font-bold text-gray-800'>Quản lý Nhân viên & Kiosk</h1>
                <StatusBadge 
                    status={kioskCount > 0 ? `Kiosk Online (${kioskCount})` : 'Kiosk Offline'} 
                />
            </div>

            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-5 text-gray-700'>Điều khiển Kiosk (UC-07, 08)</h2>
                <div className="flex space-x-3">
                    <Button onClick={handleClearKioskDB} className="bg-red-600 hover:bg-red-700 disabled:opacity-50" disabled={!isWsReady}>
                        Xóa sạch DB Kiosk
                    </Button>
                    <Button onClick={handleDumpDB} className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50" disabled={!isWsReady}>
                        Dump DB (Kiểm tra)
                    </Button>
                </div>
            </div>

            <div className='p-6 bg-white rounded-xl shadow-lg'>
                <h2 className='text-xl font-semibold mb-5 text-gray-700'>Thêm Nhân viên mới</h2>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Tên nhân viên *</label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange}
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' />
                        </div>
                        
                        <div>
                            <label className='block text-sm font-medium text-gray-700'>Email *</label>
                            <input
                                className='mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500' type="email" name="email" value={formData.email} onChange={handleInputChange} />
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
                                <option value="manager">Quản lý</option>
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
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Email</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Chức vụ</th>
                                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>Hành động</th>
                                </tr>
                            </thead>
                            <tbody className='bg-white divide-y divide-gray-200'>
                                {users.map(user => (
                                    <tr key={user._id} className='hover:bg-gray-50'>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900'>{user.employee_id}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>
                                            <Link to={`/manager/employees/${user._id}`} className="text-blue-600 hover:underline">
                                                {user.name}
                                            </Link>
                                        </td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{user.email}</td>
                                        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{user.role === 'manager' ? (
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Quản lý</span>
                                        ) : (
                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Nhân viên</span>
                                        )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <Button className='bg-green-600 hover:bg-green-700 text-xs' onClick={() => handleEnroll(user.employee_id)}>
                                                Đăng ký
                                            </Button>
                                            <Button className='bg-red-600 hover:bg-red-700 text-xs' onClick={() => handleDelete(user._id, user.name)}>Xóa</Button>
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
