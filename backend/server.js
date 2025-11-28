import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import connectDB from './config/db.js';
import apiRoutes from './routes/api.routes.js'
import authRouter from './routes/auth.js'
import http from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { createAndSendNotification, getMyNotifications, markAsRead } from './controllers/notification_Controller.js';

//Cấu hình
const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


connectDB();// Chạy hàm kết nối DB

//Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

//Phục vụ file tĩnh
app.use('/public', express.static(path.join(__dirname, 'public')));

const broadcastToAdmins = (message) => {
    const payload = (typeof message === 'object') 
        ? JSON.stringify(message) 
        : message;
        
    activeConnections.forEach((ws, userId) => {
        // (Bạn có thể kiểm tra role ở đây nếu muốn, nhưng không cần thiết)
        if (ws.readyState === ws.OPEN) {
            ws.send(payload);
        }
    });
}

app.use((req, res, next) => {
    // Truyền 2 hàm này vào TẤT CẢ request
    // để các controller có thể sử dụng
    req.broadcastToAdmins = broadcastToAdmins;
    req.getActiveConnections = () => activeConnections; // Thêm hàm này
    next();
});


// --- Gắn Routes ---
app.use('/api/auth', authRouter);
app.use('/api', apiRoutes);


// --- Khởi động Server ---
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

const devices = new Set();
// Ánh xạ từ User ID (từ MongoDB) -> kết nối WebSocket
const activeConnections = new Map(); 
// Ánh xạ từ WebSocket -> User ID (để dọn dẹp khi ngắt kết nối)
const wsToUser = new Map();

const broadcastKioskStatus = () => {
  const statusMessage = JSON.stringify({
    type: 'kiosk_status', // Tên tin nhắn mới
    count: devices.size  // Số lượng Kiosk đang kết nối
  });
  activeConnections.forEach((ws, userId) => {
    // Chỉ gửi cho các kết nối là 'manager'
    if (ws.role === 'manager' && ws.readyState === ws.OPEN) {
        ws.send(statusMessage);
    }
  });
};

wss.on('connection', (ws, req) => {
    console.log('WS: client connected');
    ws.isAlive = true;
    ws.isAuthenticated = false; // <-- Thêm trạng thái xác thực
    ws.role = 'guest';

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        ws.isAlive = true;
        try {
            const raw = message.toString();
            const txt = raw.trim();

            // --- BƯỚC XÁC THỰC (MỚI) ---
            // Yêu cầu client (React) gửi token ngay khi kết nối
            // Ví dụ: "auth:admin:token_cua_toi_o_day"
            if (txt.startsWith('auth:admin:')) {
                const token = txt.substring(11);
                try {
                    // Giải mã token
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    
                    // Chỉ chấp nhận token hợp lệ VÀ role là 'manager'
                    if (decoded && decoded.role === 'manager') {
                        console.log('WS: Admin verified:', decoded._id);
                        ws.isAuthenticated = true;
                        ws.role = 'manager';
                        const userId = decoded._id.toString(); // Lấy ID của Admin
                        activeConnections.set(userId, ws); // Lưu kết nối
                        wsToUser.set(ws, userId);
                        ws.send("auth:success"); // Báo cho React là đã OK
                        broadcastKioskStatus();
                    } else {
                        ws.send("auth:failed:invalid_role");
                        // ws.terminate(); // <-- XÓA DÒNG NÀY
                    }
                } catch (e) {
                    console.log("WS: Auth failed, invalid token");
                    ws.send("auth:failed:invalid_token");
                    // ws.terminate(); // <-- XÓA DÒNG NÀY
                }
                return;
            }
            else if (txt.startsWith('auth:employee:')) {
                const token = txt.substring(14);
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    if (decoded && decoded.role === 'employee') {
                        // ... (code đúng rồi)
                        ws.send("auth:success");
                    } else {
                        ws.send("auth:failed:invalid_role"); // <-- Thêm dòng này
                        // ws.terminate(); // <-- XÓA DÒNG NÀY
                    }
                } catch (e) {
                    ws.send("auth:failed:invalid_token"); // <-- Thêm dòng này
                    // ws.terminate(); // <-- XÓA DÒNG NÀY
                }
                return;
            }
            // Client là Kiosk (ESP32)
            if (txt === 'role:device') {
                console.log('WS: Kiosk connected');
                ws.isAuthenticated = true; // Kiosk được tin tưởng ngầm
                ws.role = 'device';
                devices.add(ws);
                broadcastKioskStatus();
                return;
            }
       
            
            // --- KẾT THÚC BƯỚC XÁC THỰC ---

            // Nếu client chưa xác thực (chưa gửi token), bắt họ xác thực
            if (!ws.isAuthenticated) {
                console.log('WS: Unauthenticated message ignored');
                ws.send("auth:required"); // Báo client "vui lòng xác thực"
                return;
            }

            // --- CÁC LỆNH ĐÃ ĐƯỢC BẢO VỆ ---

            // 1. Chỉ Manager (đã xác thực) mới được gửi lệnh
            if (ws.role === 'manager') {
                if (txt.startsWith('enroll:') || txt === 'delete_all' || txt === 'dump_db') {
                    console.log(`WS: Manager command '${txt}' -> forwarding to devices`);
                    // Gửi lệnh này đến TẤT CẢ các Kiosk
                    devices.forEach(d => {
                        if (d.readyState === d.OPEN) d.send(txt);
                    });
                }
                return;
            }

            // 2. Chỉ Kiosk mới được gửi tiến độ
            if (ws.role === 'device') {
                // Kiosk gửi (VD: "progress:...") -> Chuyển tiếp cho Admin
                activeConnections.forEach((ws, userId) => {
                    // Chỉ gửi cho các kết nối là 'manager'
                    if (ws.role === 'manager' && ws.readyState === ws.OPEN) {
                        ws.send(txt);
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
            activeConnections.delete(userId); // Xóa khỏi map
            wsToUser.delete(ws);
            console.log(`WS: User ${userId} disconnected`);
        }
        console.log('WS: client disconnected');

        if (wasDevice) {
            broadcastKioskStatus(); // Báo cho TẤT CẢ admin là Kiosk đã offline
        }
    });
});

// heartbeat
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});