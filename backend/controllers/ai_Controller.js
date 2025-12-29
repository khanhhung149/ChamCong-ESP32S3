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
    const timerLabel = `⏱️ Xử lý [${Date.now()}]`; 
    console.time(timerLabel);
    try {
        const { image, timestamp, is_offline } = req.body;

        const START_DAY      = 7 * 60;        // 07:00
        const LATE_MORNING   = 8 * 60 + 15;   // 08:15 (Trễ sáng)
        
        const MORNING_END    = 11 * 60;       // 11:00 (Bắt đầu nghỉ trưa)
        const LUNCH_BUFFER   = 12 * 60 + 30;  // 12:30 (Ranh giới giữa Ra Trưa và Vào Chiều)
        
        const AFTERNOON_START = 13 * 60;      // 13:00 (Giờ làm chiều chuẩn)
        const LATE_AFTERNOON  = 13 * 60 + 15; // 13:15 (Trễ chiều)  
        const MAX_LATE_AFTERNOON = 13 * 60 + 30; // 13:30 (Quá giờ này tính là Vắng)
        const AFTERNOON_SCAN_LIMIT = 14 * 60; // 14:00 (Sau giờ này ko tính là vào chiều nữa mà là về sớm/muộn)
        
        const WORK_END       = 17 * 60;       // 17:00 (Được về)
        const OVERTIME_START = 18 * 60;       // 18:00 (OT)

        const serverTime = new Date();
        const deviceTime = new Date(timestamp);
        
        console.log("------------------------------------------------");
        console.log("🕒 [DEBUG TIME CHECK]");
        console.log("   👉 Giờ Server hiện tại (Lúc nhận):", serverTime.toLocaleTimeString());
        console.log("   👉 Giờ từ Thiết bị gửi (Lúc chụp):", deviceTime.toLocaleTimeString());
        
        if (serverTime.getTime() - deviceTime.getTime() > 60000) {
            console.log("   ✅ ĐÂY LÀ DỮ LIỆU ĐỒNG BỘ TỪ QUÁ KHỨ!");
        } else {
            console.log("   ⚡ Đây là dữ liệu Realtime.");
        }
        console.log("------------------------------------------------");
        const logTime = timestamp ? new Date(timestamp) : new Date();
        const currentH = logTime.getHours();
        const currentM = logTime.getMinutes();
        const totalM = currentH * 60 + currentM;
        const clientIP = req.ip || "device_1";
        console.log("🔍 DEBUG BODY:", { 
            timestamp: timestamp, 
            is_offline: is_offline,
            type_of_offline: typeof is_offline 
        });
        let batchImages = [];
        if (is_offline === true || is_offline === "true") {
            console.log(`📥 Nhận dữ liệu OFFLINE lúc ${timestamp} -> Xử lý ngay!`);
            
            batchImages = [image]; 
        }

        else {
            // Logic gom 3 ảnh như cũ
            if (!recogSessions[clientIP]) recogSessions[clientIP] = { images: [], lastUpdate: Date.now() };
            if (Date.now() - recogSessions[clientIP].lastUpdate > 5000) recogSessions[clientIP].images = [];

            if (image) {
                recogSessions[clientIP].images.push(image);
                recogSessions[clientIP].lastUpdate = Date.now();
            }

            const count = recogSessions[clientIP].images.length;
            if (count < 3) {
                console.timeEnd(timerLabel);
                return res.json({ status: "collecting", count });
            }

            batchImages = recogSessions[clientIP].images;
            recogSessions[clientIP].images = []; // Reset bộ đệm
        }


        const pyRes = await axios.post(PYTHON_API_BATCH, { images: batchImages });

        const { success, vector, liveness, message, debug_score } = pyRes.data;
        if (debug_score !== undefined) {
        console.log(`📊 Liveness Score từ Python: ${debug_score.toFixed(4)}`);
        }
        const RELAXED_THRESHOLD = 3.5;

        const isAcceptable = liveness || (debug_score < RELAXED_THRESHOLD);
        if (!success || !isAcceptable) 
        {
            console.timeEnd(timerLabel);
            console.log(`❌ Bị chặn bởi AI: ${message}`);
            return  res.json({ match: false, name: "Spoof/NoFace", message });
        }

        console.log("🔹 Vector nhận được (5 số đầu):", vector.slice(0, 5));


        const users = await User.find({ is_enrolled: true });
        let bestMatch = { label: 'unknown', distance: 1.0, user: null };
        
        for (const user of users) {
            if (user.face_vector && user.face_vector.length > 0) {
                
                let bestDistForUser = 1.0;
                
                for (const dbVec of user.face_vector) {
                    const dist = calculateCosineDistance(vector, dbVec.embedding);
                    if (dist < bestDistForUser) bestDistForUser = dist;
                }

                if (bestDistForUser < 0.80) {
                    console.log(`🔍 So với [${user.name}]: Dist = ${bestDistForUser.toFixed(4)} ${bestDistForUser < 0.68 ? "✅ MATCH" : "❌"}`);
                } else {
                }

                if (bestDistForUser < bestMatch.distance) {
                    bestMatch = { label: user.name, distance: bestDistForUser, user: user };
                }
            }
        }
        console.log("-----------------------");


        if (bestMatch.distance < 0.72 && bestMatch.user) {
            console.log(`🎯 KẾT QUẢ: ${bestMatch.label} (Độ tin cậy: ${((1 - bestMatch.distance)*100).toFixed(1)}%)`);
            const user = bestMatch.user;
            
            const savedPath = saveBase64Image(batchImages[0], 'attendance_imgs', `LOG_${user.employee_id}`, logTime);
            
            const startOfDay = new Date(logTime); startOfDay.setHours(0,0,0,0);
            const endOfDay = new Date(logTime); endOfDay.setHours(23,59,59,999);
            
            let log = await AttendanceLog.findOne({ 
                            employee_id: user.employee_id, 
                            date: { $gte: startOfDay, $lte: endOfDay } 
                        });            
            let statusLog = "Đúng giờ";
            let logNote = "";
            let action = "";

            if (!log) {
                // A. Check-in Buổi Sáng
                if (totalM < MORNING_END) {
                    if (totalM <= LATE_MORNING) {
                        statusLog = "Đúng giờ";
                        logNote = `Vào Sáng ${currentH}:${currentM}`;
                    } else {
                        statusLog = "Đi trễ";
                        logNote = `Trễ Sáng ${totalM - START_DAY} phút`;
                    }
                    
                    // Tạo log buổi sáng bình thường
                    log = new AttendanceLog({ 
                        name: user.name, 
                        employee_id: user.employee_id, 
                        date: startOfDay, 
                        checkInTime: logTime, // <--- Cột Sáng
                        checkInImage: savedPath,
                        status: statusLog,
                        note: logNote
                    });
                    
                    await log.save();
                    action = "CHECK-IN";
                } 
                // B. Check-in Buổi Chiều (Bỏ sáng)
                else {
                    // --- LOGIC MỚI: CHẶN CHECK-IN QUÁ MUỘN ---
                    if (totalM > MAX_LATE_AFTERNOON) {
                        // Nếu đã quá 13:30 mà mới đến -> Từ chối và coi như Vắng
                        console.log(`❌ ${user.name} đến quá trễ (${currentH}:${currentM}), tính là VẮNG.`);
                        
                        // Bạn có thể trả về lỗi để thiết bị báo đỏ
                        console.timeEnd(timerLabel);
                        return res.json({ 
                            match: false, 
                            name: "Vang mat", 
                            message: "Đã quá giờ điểm danh chiều. Tính vắng." 
                        });
                        
                        // Hoặc nếu muốn lưu log "Vắng" vào DB để hiện đỏ trên web thì uncomment đoạn dưới:
                        /*
                        log = new AttendanceLog({
                             name: user.name, employee_id: user.employee_id, date: startOfDay,
                             status: "Vắng", note: "Vắng (Đến quá trễ chiều)"
                        });
                        await log.save();
                        */
                    }

                    statusLog = "Vắng mặt buổi sáng";
                    logNote = "Vắng Sáng - Vào Chiều";

                    log = new AttendanceLog({ 
                        name: user.name, 
                        employee_id: user.employee_id, 
                        date: startOfDay, 
                        
                        checkInTime: null,      // <--- QUAN TRỌNG: Để null để cột Sáng trống
                        checkInImage: null,     // Không có ảnh sáng
                        
                        // Chỉ điền thông tin chiều
                        checkInTimeAfternoon: logTime, 
                        checkInImageAfternoon: savedPath,

                        status: statusLog,
                        note: logNote
                    });

                    await log.save();
                    action = "CHECK-IN";
                }
            }
            else {
                const lastUpdate = log.checkOutTime || log.checkInTimeAfternoon || log.checkOutTimeMorning || log.checkInTime;
                
                // Chỉ cập nhật nếu bản ghi trước đó không null và thời gian cách nhau > 1 phút
                if (lastUpdate && (logTime.getTime() - new Date(lastUpdate).getTime() > 60000)) {

                    if (totalM >= MORNING_END && totalM < LUNCH_BUFFER && !log.checkOutTimeMorning) {
                        log.checkOutTimeMorning = logTime;
                        log.checkOutImageMorning = savedPath;
                        if (!log.note.includes("Nghỉ trưa")) log.note += " | Ra nghỉ trưa";
                        action = "RA NGHỈ TRƯA";
                    }

                    else if (totalM >= LUNCH_BUFFER && totalM < AFTERNOON_SCAN_LIMIT && !log.checkInTimeAfternoon) {
                        log.checkInTimeAfternoon = logTime;
                        log.checkInImageAfternoon = savedPath;
                        
                        if (totalM > LATE_AFTERNOON) {
                            const latePm = totalM - AFTERNOON_START;
                            log.note += ` | Trễ Chiều ${latePm}p`;
                            if (log.status === "Đúng giờ") log.status = "Đi trễ chiều";
                        } else {
                            log.note += ` | Vào Chiều ${currentH}:${currentM}`;
                        }
                        action = "VÀO LÀM CHIỀU";
                    }

                    else if (totalM >= WORK_END) {
                        log.checkOutTime = logTime;
                        log.checkOutImage = savedPath;
                        
                        const timeStr = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
                        let leaveMsg = ` | Ra về ${timeStr}`;
                        
                        if (totalM >= OVERTIME_START) {
                            leaveMsg = ` | OT đến ${timeStr}`;
                        }
                        
                        // [LOGIC MỚI] Ghi đè giờ về cũ nếu có
                        if (log.note.includes("Ra về") || log.note.includes("OT")) {
                            // Xóa đoạn cũ đi
                            log.note = log.note.replace(/ \| Ra về \d{1,2}:\d{1,2}/g, "")
                                               .replace(/ \| OT đến \d{1,2}:\d{1,2}/g, "");
                        }
                        log.note += leaveMsg;
                        action = "RA VỀ (CẬP NHẬT)";
                    }
                    else {
                        action = "QUÉT LẶP (BỎ QUA)";
                    }

                    await log.save();
                } else {
                    action = "SPAM LOG";
                }
            }
            console.log(`✅ ${action}: ${user.name} -> ${logNote || log.note}`);          
            console.timeEnd(timerLabel);
            if (!res.headersSent) return res.json({ match: true, name: user.name });
            return;
        }

        console.log(`⚠️ Unknown: Gần nhất ${bestMatch.label} (${bestMatch.distance.toFixed(2)})`);
        console.timeEnd(timerLabel);
        
        if (!res.headersSent) return res.json({ match: false, name: "unknown" });

    } catch (error) {
        try { console.timeEnd(timerLabel); } catch(e){}
        
        console.error("Server Error:", error.message);
        
        if (!res.headersSent) return res.status(500).json({ error: error.message });
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

        const batchImages = enrollSessions[employee_id];
        enrollSessions[employee_id] = []; 

        const pyRes = await axios.post(PYTHON_API_BATCH, { images: batchImages });
        
        if (!pyRes.data.success) return res.json({ success: false, message: "No face detected" });

        deleteOldEnrollImages(employee_id);


        saveBase64Image(batchImages[0], 'faces', `ENROLL_${employee_id}`);

        // Cập nhật User
        const user = await User.findOne({ employee_id });
        if (user) {
            user.face_vector.push({ 
                embedding: pyRes.data.vector, 
                quality: pyRes.data.debug_score,
                source: "esp32_batch"
            });
            user.is_enrolled = true;
            await user.save();
            console.log(`✅ Đã cập nhật dữ liệu Enroll mới cho: ${user.name}`);
        }

        return res.json({ success: true, message: "Enrollment Complete & Old Data Cleared" });

    } catch (error) {
        if (!res.headersSent) res.status(500).json({ success: false });
    }
};

const deleteOldEnrollImages = (employee_id) => {
    try {
        const dirPath = path.join(process.cwd(), 'public', 'faces');
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);
        const prefix = `ENROLL_${employee_id}_`;

        files.forEach(file => {
            if (file.startsWith(prefix)) {
                fs.unlinkSync(path.join(dirPath, file));
                console.log(`🗑️ Đã xóa ảnh cũ: ${file}`);
            }
        });
    } catch (error) {
        console.error("⚠️ Lỗi xóa ảnh cũ:", error.message);
    }
};