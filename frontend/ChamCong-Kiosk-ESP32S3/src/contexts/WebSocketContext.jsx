import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import authService from '../services/authServices.js';
import { WS_URL } from '../config.js';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
    return useContext(WebSocketContext);
};

const RECONNECT_INTERVAL = 5000;

export const WebSocketProvider = ({ children }) => {
    const [wsStatus, setWsStatus] = useState('Đang kết nối...');
    const [deviceCount, setDeviceCount] = useState(0);
    const [lastJsonMessage, setLastJsonMessage] = useState(null);
    const [lastTextMessage, setLastTextMessage] = useState('');
    
    const [isWsReady, setIsWsReady] = useState(false); 
    
    const ws = useRef(null);
    const isReadyRef = useRef(false);
    
    const reconnectTimer = useRef(null);

    const connect = useCallback(() => {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }

        if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
            ws.current.close();
        }

        const user = authService.getUser();
        if (!user) {
            setWsStatus('Offline (Chưa đăng nhập)');
            return;
        }

        const wsClient = new WebSocket(WS_URL);
        ws.current = wsClient;  
        console.log("WebSocket Context: Đang kết nối...");
        
        setIsWsReady(false);
        isReadyRef.current = false;
        setWsStatus('Đang kết nối...');

        wsClient.onopen = () => {
            console.log("WebSocket Context: Đã kết nối.");
            setWsStatus('Đã kết nối Server');
            const token = authService.getToken();
            
            if (token) {
                // [SỬA LỖI TẠI ĐÂY]
                // Nếu là manager HOẶC admin thì đều dùng auth:admin
                const authMessage = (user.role === 'manager' || user.role === 'admin')
                    ? `auth:admin:${token}` 
                    : `auth:employee:${token}`;
                
                console.log(`[WS] Sending auth for role: ${user.role}`);
                wsClient.send(authMessage);
            }
        };

        wsClient.onmessage = (event) => {
            const msgText = event.data;
            try {
                const msgJson = JSON.parse(msgText);
                console.log("WS Context (JSON):", msgJson);
                if (msgJson.type === 'device_status') {
                    setDeviceCount(msgJson.count);
                }
                setLastJsonMessage(msgJson);
            } catch (e) {
                console.log("WS Context (Text):", msgText);
                setLastTextMessage(msgText); 
                
                if (msgText === 'auth:success' && ws.current) {
                    console.log("--- SETTING READY ---");
                    isReadyRef.current = true;
                    setIsWsReady(true);
                    setWsStatus('Đã xác thực');
                }
            }
        };

        wsClient.onclose = () => {
            console.log("WebSocket Context: Đã ngắt kết nối.");
            setWsStatus(`Server Offline (Thử lại sau 5s)`);
            
            isReadyRef.current = false;
            setIsWsReady(false); 
            ws.current = null; 
            
            if (!reconnectTimer.current) {
                 reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
            }
        };

        wsClient.onerror = (err) => {
            console.error("WebSocket Context Error:", err);
            setWsStatus('Lỗi Kết nối');
        };

    }, []); 

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
            }
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, [connect]); 

    const sendWsMessage = useCallback((message) => {
        if (isReadyRef.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(message);
        } else {
            console.error("Không thể gửi tin nhắn: WebSocket chưa sẵn sàng hoặc chưa xác thực.");
            alert("Không thể gửi tin nhắn: Kết nối chưa sẵn sàng. Vui lòng thử lại sau giây lát.");
        }
    }, []);

    const value = useMemo(() => ({
        wsStatus,
        deviceCount,
        lastJsonMessage,
        lastTextMessage,
        sendWsMessage,
        isWsReady
    }), [wsStatus, deviceCount, lastJsonMessage, lastTextMessage, sendWsMessage, isWsReady]);

    return (
        <WebSocketContext.Provider value={value}>
            {children}
        </WebSocketContext.Provider>
    );
};