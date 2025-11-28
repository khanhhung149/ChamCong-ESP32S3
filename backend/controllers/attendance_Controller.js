import AttendanceLog from '../models/Attendance.js';
import User from '../models/User.js'; 


export const getMyLogs = async (req, res) => {
    try {
        const userEmployeeId = req.user.employee_id;
        if (!userEmployeeId) {
            return res.status(400).json({ message: 'Tài khoản của bạn thiếu Mã Nhân viên (employee_id).' });
        }

        const logs = await AttendanceLog.find({ employee_id: userEmployeeId })
            .sort({ date: -1 })
            .limit(50);
            
        res.json(logs);

    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

export const getLogs = async (req, res) => {
    try {
        const { startDate, endDate, page = 1 } = req.query;
        const limit = 10;
        const pageNum = Number(page);

        const filter = {};
        if (startDate || endDate) {
            filter.date = {}; 
            if (startDate) {
                filter.date.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.date.$lte = new Date(endDate);
            }
        }

        const totalLogs = await AttendanceLog.countDocuments(filter);
        const totalPages = Math.ceil(totalLogs / limit);

        const logs = await AttendanceLog.find(filter)
            .sort({ date: -1, checkInTime: -1 }) 
            .skip((pageNum - 1) * limit)
            .limit(limit);

        res.status(200).json({
            logs,
            currentPage: pageNum,
            totalPages: totalPages,
            totalLogs: totalLogs
        });
    }
    catch (error) {
        res.status(500).send({ message: 'Loi server', error: error.message });
    }
};

export const logAttendance = async (req, res) => {
    try {
        const { employee_id } = req.body;
        if (!req.file || !employee_id) {
            return res.status(400).send({ message: 'Lỗi thiếu employee_id hoặc ảnh' });
        }
        
        const user = await User.findOne({ employee_id });
        if (!user) {
            return res.status(404).send({ message: 'Nhân viên không tồn tại' });
        }

        const now = new Date(); 
        const imagePath = `/public/attendance_imgs/${req.file.filename}`;
        
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

        const existingRecord = await AttendanceLog.findOne({
            name: user.name,
            employee_id: employee_id,
            date: { $gte: todayStart }
        });

        let savedLog;
        let logType;

        if (!existingRecord) {
            console.log(`CHECK-IN cho: ${employee_id}`);
            const newLog = new AttendanceLog({
                name: user.name,
                employee_id: employee_id,
                date: todayStart,
                checkInTime: now,
                checkInImage: imagePath,
                checkOutTime: null,
                checkOutImage: null
            });
            savedLog = await newLog.save();
            logType = 'check_in';
        } else {
            console.log(`CHECK-OUT cho: ${employee_id}`);
            existingRecord.checkOutTime = now; 
            existingRecord.checkOutImage = imagePath; 
            savedLog = await existingRecord.save();
            logType = 'check_out';
        }

        req.broadcastToAdmins({
            type: 'new_log',
            logType: logType,
            data: savedLog
        });

        res.status(200).send({ message: 'Cham cong thanh cong' });

    } catch (error) {
        console.error('Loi khi cham cong', error);
        res.status(500).send({ message: ' Loi server', error: error.message });
    }
};
