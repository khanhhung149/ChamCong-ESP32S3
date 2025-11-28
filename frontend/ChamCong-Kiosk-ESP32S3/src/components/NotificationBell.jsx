import React, {useState, useEffect, useRef} from "react";
import { api } from "../services/authServices.js";
import { Link } from "react-router-dom";
import { FaBell } from "react-icons/fa";
import { useWebSocket } from "../contexts/WebSocketContext.jsx";

const NotificationBell = ({userRole}) => {
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);

    const { lastJsonMessage } = useWebSocket();

    const fetchNotifications = async() => {
        try{
            const res = await api.get(`/api/notifications`); //
            
            setNotifications(res.data);
        }
        catch(error){
            console.error("Lỗi tải thông báo", error);
        }
    };
    useEffect(()=>{
        fetchNotifications();
    }, []);

    useEffect(() => {
        if (lastJsonMessage) {
            if (lastJsonMessage.type === 'new_notification') {
                setNotifications(prev => [lastJsonMessage.data, ...prev]);
            }
        }
    }, [lastJsonMessage]);

    const handleMarkAsRead = async(id) =>{
        setNotifications(prev => prev.filter(n=> n._id !== id));
        try{
            await api.put(`/api/notifications/${id}/read`, {});
        }
        catch(error){
            console.error("Lỗi đánh dấu đã đọc", error);
        }
    };
    
    const unreadCount = notifications.length;

    return(
        <div className="relative">
            <button onClick={()=>
                setIsOpen(!isOpen)} className="relative text-gray-300 hover:text-white ml-3 mt-2"
            >
                <FaBell/>
                {unreadCount >0 &&(
                    <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {unreadCount}
                    </span>
                )}
            </button>
            {isOpen &&(
                <div className="absolute -right-14 mt-2 w-60 bg-white rounded-lg shadow-lg z-20">
                    <div className="p-3 font-semibold text-gray-800 border-b">Thông báo</div>
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <p className="p-3 text-sm text-gray-500">Không có thông báo mới.</p>
                        ) : (
                            notifications.map(notif => (
                                <div key={notif._id} className="p-3 border-b hover:bg-gray-50">
                                    <Link to={notif.link || '#'} onClick={() => setIsOpen(false)}>
                                        <p className="text-sm text-gray-700">{notif.message}</p>
                                        <p className="text-xs text-gray-400">{new Date(notif.createdAt).toLocaleString('vi-VN')}</p>
                                    </Link>
                                    <button onClick={() => handleMarkAsRead(notif._id)} className="text-xs text-blue-500 hover:underline">
                                        Đánh dấu đã đọc
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
};

export default NotificationBell;