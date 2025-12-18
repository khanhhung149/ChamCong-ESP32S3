import axios from 'axios';
import User from '../models/User.js';
import AttendanceLog from '../models/Attendance.js';
import fs from 'fs';
import path from 'path';

const PYTHON_API_BATCH = 'http://127.0.0.1:8000/extract_vector_batch';

// 1. Hàm tính khoảng cách Cosine
function calculateCosineDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 1.0;
    let dotProduct = 0.0, normA = 0.0, normB = 0.0;
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        normA += vec1[i] * vec1[i];
        normB += vec2[i] * vec2[i];
    }
    if (normA === 0 || normB === 0) return 1.0;
    return 1.0 - (dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)));
}

// 2. Hàm lưu ảnh Base64
const saveBase64Image = (base64String, folderName, prefix, customTime) => {
    try {
        const dirPath = path.join(process.cwd(), 'public', folderName);
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let imageBuffer = null;
        if (matches && matches.length === 3) {
            imageBuffer = Buffer.from(matches[2], 'base64');
        } else {
            imageBuffer = Buffer.from(base64String, 'base64');
        }

        // [FIX 1] Dùng timestamp từ ESP32 (chuyển sang số) để đặt tên file
        // Nếu không có customTime thì mới dùng Date.now()
        const timePart = customTime ? new Date(customTime).getTime() : Date.now();
        
        const filename = `${prefix}_${timePart}.jpg`;
        const savePath = path.join(dirPath, filename);

        fs.writeFileSync(savePath, imageBuffer);
        console.log(`📸 Saved: public/${folderName}/${filename}`);
        return `/public/${folderName}/${filename}`;
    } catch (error) {
        console.error("❌ Lỗi lưu ảnh:", error.message);
        return null; 
    }
};

// Biến lưu Session tạm trong RAM
const recogSessions = {}; 
const enrollSessions = {}; 

// --- API RECOGNIZE ---
export const recognizeFace = async (req, res) => {
    console.time("⏱️ Tổng thời gian Nhận diện");
    try {
        const { image, timestamp } = req.body; 
        const clientIP = req.ip || "device_1";

        if (!recogSessions[clientIP]) recogSessions[clientIP] = { images: [], lastUpdate: Date.now() };
        if (Date.now() - recogSessions[clientIP].lastUpdate > 5000) recogSessions[clientIP].images = [];

        if (image) {
            recogSessions[clientIP].images.push(image);
            recogSessions[clientIP].lastUpdate = Date.now();
        }

        const count = recogSessions[clientIP].images.length;
        if (count < 3) {
            console.timeEnd("⏱️ Tổng thời gian Nhận diện"); 
            return res.json({ status: "collecting", count });
        }

        const batchImages = recogSessions[clientIP].images;
        recogSessions[clientIP].images = []; 

        console.time("   🐍 Python xử lý");

        const pyRes = await axios.post(PYTHON_API_BATCH, { images: batchImages });

        console.timeEnd("   🐍 Python xử lý");
        const { success, vector, liveness, message } = pyRes.data;

        if (!success || !liveness) return 
        {
            console.timeEnd("⏱️ Tổng thời gian Nhận diện");
            res.json({ match: false, name: "Spoof/NoFace", message });
        }

        console.log("🔹 Vector nhận được (5 số đầu):", vector.slice(0, 5));

        console.time("   🍃 MongoDB tìm kiếm");

        const users = await User.find({ is_enrolled: true });
        let bestMatch = { label: 'unknown', distance: 1.0, user: null };
        
        for (const user of users) {
            if (user.face_vector && user.face_vector.length > 0) {
                
                let bestDistForUser = 1.0;
                
                for (const dbVec of user.face_vector) {
                    const dist = calculateCosineDistance(vector, dbVec.embedding);
                    if (dist < bestDistForUser) bestDistForUser = dist;
                }

                // LOG DEBUG: In ra khoảng cách với từng nhân viên
                if (bestDistForUser < 0.80) {
                    console.log(`🔍 So với [${user.name}]: Dist = ${bestDistForUser.toFixed(4)} ${bestDistForUser < 0.68 ? "✅ MATCH" : "❌"}`);
                } else {
                    // console.log(`   So với [${user.name}]: ${bestDistForUser.toFixed(4)} (Quá xa)`);
                }

                if (bestDistForUser < bestMatch.distance) {
                    bestMatch = { label: user.name, distance: bestDistForUser, user: user };
                }
            }
        }
        console.timeEnd("   🍃 MongoDB tìm kiếm");
        console.log("-----------------------");

        // [SỬA LỖI TẠI ĐÂY: Đã xóa đoạn code thừa gây lỗi ReferenceError]

        if (bestMatch.distance < 0.68 && bestMatch.user) {
            console.log(`🎯 KẾT QUẢ: ${bestMatch.label} (Độ tin cậy: ${((1 - bestMatch.distance)*100).toFixed(1)}%)`);
            const user = bestMatch.user;
            
            const logTime = timestamp ? new Date(timestamp) : new Date();
            const savedPath = saveBase64Image(batchImages[0], 'attendance_imgs', `LOG_${user.employee_id}`, logTime);
            
            const startOfDay = new Date(logTime); startOfDay.setHours(0,0,0,0);
            
            let log = await AttendanceLog.findOne({ employee_id: user.employee_id, date: { $gte: startOfDay } });
            
            if (!log) {
                console.log(`✅ [NEW] Check-in: ${user.name} at ${logTime.toLocaleTimeString()}`);
                log = new AttendanceLog({ 
                    name: user.name, employee_id: user.employee_id, date: startOfDay, 
                    checkInTime: logTime, checkInImage: savedPath 
                });
                await log.save();
            } else {
                 if (logTime.getTime() - new Date(log.checkInTime).getTime() > 60000) {
                    if (!log.checkOutTime || logTime > new Date(log.checkOutTime)) {
                        console.log(`👋 [UPDATE] Check-out: ${user.name} at ${logTime.toLocaleTimeString()}`);
                        log.checkOutTime = logTime;
                        log.checkOutImage = savedPath;
                        await log.save();
                    }
                 }
            }
            console.timeEnd("⏱️ Tổng thời gian Nhận diện");
            return res.json({ match: true, name: user.name });
        }

        console.log(`⚠️ KHÔNG NHẬN RA. Gần nhất là: ${bestMatch.label} (${bestMatch.distance.toFixed(4)})`);
        console.timeEnd("⏱️ Tổng thời gian Nhận diện");
        return res.json({ match: false, name: "unknown" });

    } catch (error) {
        console.timeEnd("⏱️ Tổng thời gian Nhận diện")
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
// --- API ENROLL ---
export const enrollFace = async (req, res) => {
    try {
        const { image, employee_id } = req.body;
        
        if (!enrollSessions[employee_id]) enrollSessions[employee_id] = [];
        enrollSessions[employee_id].push(image);
        
        const count = enrollSessions[employee_id].length;
        console.log(`📥 Enroll ${employee_id}: ${count}/5`);

        if (count < 5) return res.json({ status: "collecting", count });

        // Đủ 5 ảnh -> Gọi Python
        const batchImages = enrollSessions[employee_id];
        enrollSessions[employee_id] = []; // Reset

        const pyRes = await axios.post(PYTHON_API_BATCH, { images: batchImages });
        
        if (!pyRes.data.success) return res.json({ success: false, message: "No face detected" });

        // --- [FIX] LƯU ẢNH ENROLL VÀO FOLDER ---
        // Lưu ảnh đầu tiên làm bằng chứng
        saveBase64Image(batchImages[0], 'faces', `ENROLL_${employee_id}`);

        // Cập nhật User
        const user = await User.findOne({ employee_id });
        if (user) {
            user.face_vector.push({ 
                embedding: pyRes.data.vector, 
                quality: pyRes.data.debug_score,
                source: "esp32_batch"
            });
            user.is_enrolled = true; // <--- Đánh dấu đã enroll
            await user.save();
        }

        return res.json({ success: true, message: "Enrollment Complete" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
};