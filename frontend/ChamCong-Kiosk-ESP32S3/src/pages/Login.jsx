import React, {useState} from 'react'
import { useNavigate } from 'react-router-dom';
import authService from '../services/authServices.js';

const Login = () => {
    const [account, setAccount] = useState('');
    const [password,setPassword] = useState('');
    const [error, setError]= useState('');
    const navigate = useNavigate();
    const handleSubmit = async (e) =>{
        e.preventDefault();
        setError('');
        try{
            const data = await authService.login(account, password);

            if (data.user) {
                if (data.user.role === 'admin') {
                    navigate('/admin');
                } else if (data.user.role === 'manager') {
                    navigate('/manager');
                } else {
                    navigate('/employee');
                }
            } else {
                setError('Đăng nhập thành công nhưng không lấy được thông tin user.');
            }
        }catch(error){
            setError('Đăng nhập thất bại. Vui lòng kiểm tra lại Email hoặc Mật khẩu.');
            console.log(error);
        }
    }

  return (
    <div className='flex flex-cols items-center h-screen justify-center flex-col gap-4 bg-[url(../background.jpg)] bg-cover space-y-6'>
      <h2 className='font-bungee text-white text-3xl font-bold drop-shadow-lg'>Hệ thống chấm công</h2>
      <div className='w-96 rounded-xl bg-black/20 p-8 shadow-xl backdrop-blur-md border border-white/10'>
        <form onSubmit={handleSubmit}>
            
            <div className='mb-4'>
                <label htmlFor="account" className='block text-gray-200 font-medium'>Tài khoản</label>
                <input type="text" 
                placeholder='Tài khoản'
                className='w-full bg-transparent border border-gray-300/50 rounded-md px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/70'
                onChange={(e) => setAccount(e.target.value)}
                required
                />
            </div>
            <div className='mb-4'>
                <label htmlFor="password" className='block text-gray-200 font-medium'>Mật khẩu</label>
                <input type="password" 
                placeholder='Nhập mật khẩu' 
                className='w-full bg-transparent border border-gray-300/50 rounded-md px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/70'
                onChange={(e) => setPassword(e.target.value)}
                required
                />
            </div>
            {error && (
            <p className="mb-4 text-xs text-red-300 bg-red-900/50 p-2 rounded-md">{error}</p>
            )}
            
            <div className='mb-4'>
                <button 
                type='submit'
                className='w-full py-3 border-none bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors cursor-pointer'>Đăng nhập</button>
            </div>
        </form>
      </div>
    </div>
  )
}

export default Login
