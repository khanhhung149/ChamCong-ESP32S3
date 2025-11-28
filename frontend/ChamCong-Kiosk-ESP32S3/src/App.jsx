import authService from './services/authServices.js';
import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from "react-router-dom"
import Login from "./pages/Login"
import ManagerDashboard from "./pages/ManagerDashboard"
import ProtectedRoute from './components/ProtectedRoute';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ManagePage from './pages/ManagePage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import EmployeeProfilePage from './pages/EmployeeProfilePage.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import ManagerRequestPage from './pages/ManagerRequestPage.jsx';
import EmployeeRequestPage from './pages/EmployeeRequestPage.jsx';
import { TbLayoutDashboardFilled, TbClockCheck } from "react-icons/tb";
import { FaUsers } from "react-icons/fa";
import { BiSolidUserCheck } from "react-icons/bi";
import { CgProfile } from "react-icons/cg";
import { CiSquareQuestion } from "react-icons/ci";
import { WebSocketProvider } from './contexts/WebSocketContext.jsx';



const SidebarLink = ({ to, children, end=false }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors cursor-pointer
      ${isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`
    }
  >
    {children}
  </NavLink>
);

const ManagerLayout = () => (
  <div className="flex h-screen bg-gray-100">
  
    <div className="flex w-64 flex-col bg-gray-800 text-white">

      <div className="flex h-16 items-center justify-center px-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Manager</h1>
        <NotificationBell userRole="manager" />
      </div>

      <nav className="flex-1 space-y-2 p-4">
        <SidebarLink to="/manager" end><TbLayoutDashboardFilled className='mr-1' size={16}/>Trang chủ</SidebarLink>
        <SidebarLink to="/manager/employees"> <FaUsers className='mr-1' size={16}/>Quản lý nhân viên</SidebarLink>
        <SidebarLink to="/manager/reports"><TbClockCheck className='mr-1' size={16}/>Báo cáo</SidebarLink>
        <SidebarLink to="/manager/requests"><BiSolidUserCheck className='mr-1' size={16}/>Duyệt yêu cầu</SidebarLink>
      </nav>

      <div className="p-4">
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Đăng xuất
        </button>
      </div>
    </div>
    <div className="flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto p-6">
        <Outlet /> 
      </div>
    </div>
  </div>
);

const EmployeeLayout = () => (
  <div className="flex h-screen bg-gray-100">
    <div className="flex w-64 flex-col bg-gray-800 text-white">
      <div className="flex h-16 items-center justify-center px-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Employee</h1>
        <NotificationBell userRole="employee" />
      </div>
      <nav className="flex-1 space-y-2 p-4">
        <SidebarLink to="/employee" end><CgProfile className='mr-1' size={16}/>Trang cá nhân</SidebarLink>
        <SidebarLink to="/employee/requests"><CiSquareQuestion className='mr-1' size={16}/>Yêu cầu của tôi</SidebarLink>
      </nav>
      <div className="p-4">
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Đăng xuất
        </button>
      </div>
    </div>

    <div className="flex-1 flex-col overflow-y-auto">
      <div className="container mx-auto p-6">
        <Outlet /> 
      </div>
    </div>
  </div>
);
function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        <Route path="/login" element={<Login />} />

        <Route 
          path="/manager" 
          element={<ProtectedRoute role="manager">
            <WebSocketProvider>
              <ManagerLayout />
              </WebSocketProvider>
            </ProtectedRoute>}
        >
          <Route index element={<ManagerDashboard />} /> 
          <Route path="employees" element={<ManagePage />} />
          <Route path="reports" element={<ReportPage />} /> 
          <Route path="requests" element={<ManagerRequestPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          
        </Route>

        
        <Route 
          path="/employee" 
          element={<ProtectedRoute role="employee">  
            <WebSocketProvider>
              <EmployeeLayout />
            </WebSocketProvider>
            </ProtectedRoute>}
        >
          <Route index element={<EmployeeDashboard />} /> 
          <Route path="requests" element={<EmployeeRequestPage />} />
        </Route>

        
        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

const HomeRedirect = () => {
  const user = authService.getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'manager') return <Navigate to="/manager" replace />;
  if (user.role === 'employee') return <Navigate to="/employee" replace />;
  return <Navigate to="/login" replace />;
};

export default App
