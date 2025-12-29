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
import UserReport from './pages/UserReport.jsx'; 
import AdminReportList from './pages/AdminReportList.jsx';
import DeviceConfigPage from './pages/DeviceConfigPage.jsx';
import { IoSettingsSharp } from "react-icons/io5";
import { TbLayoutDashboardFilled, TbClockCheck } from "react-icons/tb";
import { FaUsers } from "react-icons/fa";
import { BiSolidUserCheck } from "react-icons/bi";
import { CgProfile } from "react-icons/cg";
import { CiSquareQuestion } from "react-icons/ci";
import { WebSocketProvider } from './contexts/WebSocketContext.jsx';
import { FaSignOutAlt } from "react-icons/fa";
import { MdReportProblem } from "react-icons/md";

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

const MobileNavLink = ({ to, children, icon, end=false }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `flex flex-col items-center justify-center w-full py-2 text-xs font-medium transition-colors
      ${isActive
        ? 'text-blue-600'
        : 'text-gray-500 hover:text-gray-700'
      }`
    }
  >
    <span className="mb-1 text-xl">{icon}</span>
    <span className="truncate max-w-[60px]">{children}</span>
  </NavLink>
);

const MainLayout = ({ role, title }) => {
  return (
    <div className="flex h-screen bg-gray-100 flex-col md:flex-row">
      <div className="hidden md:flex w-64 flex-col bg-gray-800 text-white flex-shrink-0">
        <div className="flex h-16 items-center justify-center px-4 shadow-md bg-gray-900">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <NotificationBell userRole={role} />
        </div>

        <nav className="flex-1 space-y-2 p-4">
          <SidebarLink to={`/${role}`} end><TbLayoutDashboardFilled className='mr-1' size={16}/>Trang chủ</SidebarLink>

          <SidebarLink to={`/${role}/profile`}>
              <CgProfile className='mr-1' size={16}/>Hồ sơ cá nhân
          </SidebarLink>

          <SidebarLink to={`/${role}/employees`}><FaUsers className='mr-1' size={16}/>Nhân viên</SidebarLink>
          <SidebarLink to={`/${role}/reports`}><TbClockCheck className='mr-1' size={16}/>Báo cáo</SidebarLink>
          <SidebarLink to={`/${role}/requests`}><BiSolidUserCheck className='mr-1' size={16}/>Duyệt YC</SidebarLink>
          <SidebarLink to={`/${role}/incidents`}>
              <MdReportProblem className='mr-1' size={16}/>
              {role === 'admin' ? 'Quản lý Sự cố' : 'Báo cáo sự cố'}
          </SidebarLink>
          {role === 'admin' && (
             <SidebarLink to={`/${role}/device-config`}>
                <IoSettingsSharp className='mr-1' size={16}/> Cấu hình thiết bị
             </SidebarLink>
          )}
        </nav>

        <div className="p-4">
          <button 
            onClick={() => {
              authService.logout();
              window.location.href = '/login';
            }}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            <FaSignOutAlt size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden h-full relative">
          <div className="md:hidden flex items-center justify-between bg-gray-800 text-white p-4 shadow-md z-10">
              <h1 className="text-lg font-bold">{title}</h1>
              <NotificationBell userRole={role} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-6">
              <Outlet /> 
          </div>

          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around pb-safe">
              <MobileNavLink to={`/${role}`} end icon={<TbLayoutDashboardFilled />}>Home</MobileNavLink>
              
              <MobileNavLink to={`/${role}/profile`} icon={<CgProfile />}>Tôi</MobileNavLink>
              
              <MobileNavLink to={`/${role}/employees`} icon={<FaUsers />}>NV</MobileNavLink>
              <MobileNavLink to={`/${role}/reports`} icon={<TbClockCheck />}>Báo cáo</MobileNavLink>
              <MobileNavLink to={`/${role}/requests`} icon={<BiSolidUserCheck />}>Duyệt</MobileNavLink>
              <MobileNavLink to={`/${role}/incidents`} icon={<MdReportProblem />}>Sự cố</MobileNavLink>
              {role === 'admin' && (
                  <MobileNavLink to={`/${role}/device-config`} icon={<IoSettingsSharp />}>IoT</MobileNavLink>
              )}
              <button onClick={() => { authService.logout(); window.location.href = '/login'; }} className="flex flex-col items-center justify-center w-full py-2 text-xs font-medium text-red-500">
                  <span className="mb-1 text-xl"><FaSignOutAlt /></span><span>Thoát</span>
              </button>
          </div>
      </div>
    </div>
  );
};

const EmployeeLayout = () => (
  <div className="flex h-screen bg-gray-100 flex-col md:flex-row">
    <div className="hidden md:flex w-64 flex-col bg-gray-800 text-white flex-shrink-0">
      <div className="flex h-16 items-center justify-center px-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Nhân viên</h1>
        <NotificationBell userRole="employee" />
      </div>
      <nav className="flex-1 space-y-2 p-4">
        <SidebarLink to="/employee" end><CgProfile className='mr-1' size={16}/>Trang cá nhân</SidebarLink>
        <SidebarLink to="/employee/requests"><CiSquareQuestion className='mr-1' size={16}/>Yêu cầu</SidebarLink>
        <SidebarLink to="/employee/incidents"><MdReportProblem className='mr-1' size={16}/>Báo sự cố</SidebarLink>
      </nav>
      <div className="p-4">
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
    >
      <FaSignOutAlt size={16} />
      <span>Đăng xuất</span>
        </button>
      </div>
    </div>

    <div className="flex-1 flex flex-col overflow-hidden h-full relative">
       <div className="md:hidden flex items-center justify-between bg-gray-800 text-white p-4 shadow-md z-10">
            <h1 className="text-lg font-bold">Nhân viên</h1>
            <NotificationBell userRole="employee" />
        </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-6">
        <Outlet /> 
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around pb-safe">
        <MobileNavLink to="/employee" end icon={<CgProfile />}>Hồ sơ</MobileNavLink>
        <MobileNavLink to="/employee/requests" icon={<CiSquareQuestion />}>Yêu cầu</MobileNavLink>
        <MobileNavLink to="/employee/incidents" icon={<MdReportProblem />}>Sự cố</MobileNavLink>
        <button 
            onClick={() => {
                if(window.confirm('Đăng xuất?')) {
                    authService.logout();
                    window.location.href = '/login';
                }
            }}
            className="flex flex-col items-center justify-center w-full py-2 text-xs font-medium text-red-500"
        >
            <span className="mb-1 text-xl"><FaSignOutAlt /></span>
            <span>Thoát</span>
        </button>
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
            <WebSocketProvider><MainLayout role="manager" title="Quản lý" /></WebSocketProvider>
          </ProtectedRoute>}
        >
          <Route index element={<ManagerDashboard />} /> 
          <Route path="employees" element={<ManagePage />} />
          <Route path="reports" element={<ReportPage />} /> 
          <Route path="requests" element={<ManagerRequestPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          
          <Route path="profile" element={<EmployeeDashboard />} />
          
          <Route path="incidents" element={<UserReport />} />
        </Route>

        <Route 
          path="/admin" 
          element={<ProtectedRoute role="admin">
            <WebSocketProvider><MainLayout role="admin" title="Quản trị viên" /></WebSocketProvider>
          </ProtectedRoute>}
        >
          <Route index element={<ManagerDashboard />} /> 
          <Route path="employees" element={<ManagePage />} />
          <Route path="reports" element={<ReportPage />} /> 
          <Route path="requests" element={<ManagerRequestPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          
          <Route path="profile" element={<EmployeeDashboard />} />
          
          <Route path="incidents" element={<AdminReportList />} />
          <Route path="device-config" element={<DeviceConfigPage />} />
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
          <Route path="incidents" element={<UserReport />} />
        </Route>

        
        <Route path="/" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

const HomeRedirect = () => {
  const user = authService.getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'manager') return <Navigate to="/manager" replace />;
  if (user.role === 'employee') return <Navigate to="/employee" replace />;
  return <Navigate to="/login" replace />;
};

export default App;