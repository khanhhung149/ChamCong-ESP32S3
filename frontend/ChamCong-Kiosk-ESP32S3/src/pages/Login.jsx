import React, {useState} from 'react'
import { useNavigate } from 'react-router-dom';
import authService from '../services/authServices.js';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password,setPassword] = useState('');
    const [error, setError]= useState('');
    const navigate = useNavigate();
    const handleSubmit = async (e) =>{
        e.preventDefault();
        setError('');
        try{
            const data = await authService.login(email, password);

            if (data.user && data.user.role ==='manager'){
                navigate('/manager');
            }
            else if (data.user) { 
                navigate('/employee');
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
                <label htmlFor="email" className='block text-gray-200 font-medium'>Email</label>
                <input type="email" 
                placeholder='Địa chỉ email'
                className='w-full bg-transparent border border-gray-300/50 rounded-md px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/70'
                onChange={(e) => setEmail(e.target.value)}
                required
                />
            </div>
            <div className='mb-4'>
                <label htmlFor="password" className='block text-gray-200 font-medium'>Password</label>
                <input type="password" 
                placeholder='Mật khẩu' 
                className='w-full bg-transparent border border-gray-300/50 rounded-md px-3 py-2 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-white/70'
                onChange={(e) => setPassword(e.target.value)}
                required
                />
            </div>
            {error && (
            <p className="mb-4 text-xs text-red-300 bg-red-900/50 p-2 rounded-md">{error}</p>
            )}
            <div className='mb-4 flex items-center justify-between'>
                <label className='inline-flex items-center'>
                    <input type="checkbox" className='form-checkbox rounded text-blue-500 bg-transparent border-gray-300/50 focus:ring-blue-500/70'/>
                    <span className='ml-2 text-gray-200 text-xs'>Ghi nhớ đăng nhập</span>
                </label>
                <a href="#" className='text-blue-300 hover:text-blue-100 text-xs'>Quên mật khẩu?</a>
            </div>
            
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
