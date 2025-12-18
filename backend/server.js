import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import connectDB from './config/db.js';
import apiRoutes from './routes/api.routes.js'
import authRouter from './routes/auth.js'
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws'; 
import jwt from 'jsonwebtoken';
import aiRoutes from './routes/ai.routes.js';

//Cấu hình
const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

connectDB(); 

// --- 1. KHAI BÁO BIẾN LƯU KẾT NỐI ---
const devices = new Set();
const activeConnections = new Map(); 
const wsToUser = new Map();

//Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

//Phục vụ file tĩnh
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- 2. HÀM GỬI TIN NHẮN (BROADCAST) ---

const broadcastToAdmins = (message) => {
    const payload = (typeof message === 'object') ? JSON.stringify(message) : message;
    activeConnections.forEach((ws, userId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    });
}

const broadcastToDevices = (command) => {
    console.log(`[WS] Broadcasting to ${devices.size} devices: ${command}`);
    devices.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(command);
        }
    });
}

// [QUAN TRỌNG] Sửa hàm này để gửi status cho cả ADMIN và MANAGER
const broadcastDeviceStatus = () => {
  const statusMessage = JSON.stringify({
    type: 'device_status',
    count: devices.size  
  });
  
  activeConnections.forEach((ws, userId) => {
    // Check cả 2 quyền
    if ((ws.role === 'manager' || ws.role === 'admin') && ws.readyState === WebSocket.OPEN) {
        ws.send(statusMessage);
    }
  });
};

// --- 3. MIDDLEWARE ---
app.use((req, res, next) => {
    req.broadcastToAdmins = broadcastToAdmins;
    req.getActiveConnections = () => activeConnections;
    req.broadcastToDevices = broadcastToDevices; 
    next();
});

// --- Routes ---
app.use('/api/auth', authRouter);
app.use('/api', apiRoutes);
app.use('/api/ai', aiRoutes);

// --- Server & WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    console.log('WS: client connected');
    ws.isAlive = true;
    ws.isAuthenticated = false;
    ws.role = 'guest';

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        ws.isAlive = true;
        try {
            const raw = message.toString();
            const txt = raw.trim();

            // 1. Xử lý xác thực cho Admin/Manager
            if (txt.startsWith('auth:admin:')) {
                const token = txt.substring(11);
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    
                    // [SỬA] Chấp nhận cả role 'manager' VÀ 'admin'
                    if (decoded && (decoded.role === 'manager' || decoded.role === 'admin')) {
                        console.log(`WS: ${decoded.role} verified:`, decoded._id);
                        
                        ws.isAuthenticated = true;
                        ws.role = decoded.role; // Lưu đúng role (admin hoặc manager)
                        
                        const userId = decoded._id.toString();
                        activeConnections.set(userId, ws);
                        wsToUser.set(ws, userId);
                        
                        ws.send("auth:success");
                        broadcastDeviceStatus(); // Gửi trạng thái ngay khi kết nối
                    } else {
                        ws.send("auth:failed:invalid_role");
                    }
                } catch (e) {
                    console.log("WS: Auth failed, invalid token");
                    ws.send("auth:failed:invalid_token");
                }
                return;
            }
            
            // 2. Xác thực cho Employee (Giữ nguyên)
            else if (txt.startsWith('auth:employee:')) {
                const token = txt.substring(14);
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    if (decoded && decoded.role === 'employee') {
                        ws.send("auth:success");
                    } else {
                        ws.send("auth:failed:invalid_role");
                    }
                } catch (e) {
                    ws.send("auth:failed:invalid_token"); 
                }
                return;
            }
            
            // 3. Kết nối từ Device (ESP32)
            if (txt === 'role:device') {
                console.log('WS: Device connected');
                ws.isAuthenticated = true;
                ws.role = 'device';
                devices.add(ws);
                broadcastDeviceStatus();
                return;
            }
       
            if (!ws.isAuthenticated) {
                // ws.send("auth:required"); // Có thể tắt dòng này để đỡ spam log
                return;
            }

            // 4. Xử lý lệnh từ Admin/Manager gửi xuống Device
            // [SỬA] Cho phép cả admin thực hiện
            if (ws.role === 'manager' || ws.role === 'admin') {
                // Chỉ forward những lệnh hợp lệ (Enroll, Delete)
                // Đã xóa 'dump_db' và 'delete_all' rác
                if (txt.startsWith('enroll:') || txt.startsWith('delete:')) {
                    console.log(`WS: Command '${txt}' from ${ws.role} -> forwarding to devices`);
                    devices.forEach(d => {
                        if (d.readyState === WebSocket.OPEN) d.send(txt);
                    });
                }
                return;
            }

            // 5. Tin nhắn từ Device gửi lên (Forward cho Admin/Manager xem)
            if (ws.role === 'device') {
                activeConnections.forEach((conWs) => {
                    // Gửi cho cả Manager và Admin
                    if ((conWs.role === 'manager' || conWs.role === 'admin') && conWs.readyState === WebSocket.OPEN) {
                        conWs.send(txt);
                    }
                });
                return;
            }

        } catch (e) {
            console.error('WS message error', e);
        }
    });

    ws.on('close', () => {
        const wasDevice = devices.has(ws);
        devices.delete(ws);
        if (wsToUser.has(ws)) {
            const userId = wsToUser.get(ws);
            activeConnections.delete(userId);
            wsToUser.delete(ws);
            console.log(`WS: User ${userId} disconnected`);
        }
        
        if (wasDevice) {
            console.log('WS: Device disconnected');
            broadcastDeviceStatus(); // Cập nhật lại số lượng thiết bị
        }
    });
});

// Ping keep-alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, '0.0.0.0', ()=>{
    console.log(`Server running on port ${PORT}`);
});