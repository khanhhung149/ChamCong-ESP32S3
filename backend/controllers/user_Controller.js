import User from '../models/User.js';
import bcrypt from 'bcrypt';
import AttendanceLog from '../models/Attendance.js';
import Request from '../models/Request.js';
import Attendance from '../models/Attendance.js'; 
import Report from '../models/Report.js';
import fs from 'fs';
import path from 'path';



export const updateUserEnrollStatus = async (req, res) => {
    const { employee_id, is_enrolled, face_vector } = req.body;
    try{
        const user = await User.findOne({employee_id});
        if(!user){
            return  res.status(404).json({message: "Nhân viên không tồn tại"});
        }
        user.is_enrolled = is_enrolled;

        if (face_vector && Array.isArray(face_vector)) {
            user.face_vector = face_vector;
            console.log(`Đã lưu vector khuôn mặt cho ${user.name} (${face_vector.length} chiều)`);
        }
        await user.save();
        res.status(200).json({ message: "Cập nhật thành công" });
    }
    catch(error){
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
    
};

export const createUser = async (req, res) => {
    const { name, account, password, role } = req.body;
    const creator = req.user;
    try {
        if (!name || !account || !password || !role) {
            return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin" });
        }


        if (creator.role === 'manager' && role !== 'employee') {
            return res.status(403).json({ 
                message: "Manager chỉ có quyền tạo tài khoản Nhân viên (Employee)." 
            });
        }

        const accountExists = await User.findOne({ account });
        if (accountExists) {
            return res.status(400).json({ message: "Tên tài khoản đã được sử dụng" });
        }

        let prefix = "NV"; 
        if (role === 'manager') prefix = "MGR";

        let newEmployeeId = `${prefix}001`;


        const lastUser = await User.findOne({ 
            employee_id: { $regex: `^${prefix}` } 
        }).sort({ createdAt: -1 });

        if (lastUser && lastUser.employee_id) {
            const currentIdStr = lastUser.employee_id.replace(prefix, ""); 
            const currentIdNum = parseInt(currentIdStr);

            if (!isNaN(currentIdNum)) {
                const nextIdNum = currentIdNum + 1;
                newEmployeeId = prefix + nextIdNum.toString().padStart(3, "0");
            }
        }
        
        console.log(`Creating ${role}: ${newEmployeeId}`);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            employee_id: newEmployeeId,
            account,
            password: hashedPassword,
            role
        });

        const savedUser = await newUser.save();

        res.status(201).json({
            _id: savedUser._id,
            name: savedUser.name,
            account: savedUser.account,
            role: savedUser.role,
            employee_id: savedUser.employee_id
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const currentUser = req.user;
        let filter = {};

        if (currentUser.role === 'manager') {
            filter = { role: 'employee' };
        }
        else if (currentUser.role === 'admin') {
            filter = { role: { $ne: 'admin' } }; 
        }

        const users = await User.find(filter)
            .select('-password') 
            .sort({ createdAt: -1 });

        res.status(200).json(users);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
}

const safeDeleteFile = (filePath) => {
    try {
        if (!filePath) return;
        const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        const absolutePath = path.join(process.cwd(), relativePath);
        if (fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isFile()) {
            fs.unlinkSync(absolutePath);
            console.log(`[FILE] Đã xóa ảnh cũ: ${absolutePath}`);
        }
    } catch (err) { console.error(`[ERR] Lỗi xóa file: ${err.message}`); }
};

export const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: "User not found" });

        const employeeIdToDelete = user.employee_id; 
        const userObjectId = user._id;

        console.log(`--- BẮT ĐẦU QUY TRÌNH XÓA NHÂN VIÊN: ${employeeIdToDelete} ---`);

        if (user.face_model_path) safeDeleteFile(user.face_model_path);
        if (user.avatar_path) safeDeleteFile(user.avatar_path);

        if (employeeIdToDelete) {
            const facesDir = path.join(process.cwd(), 'public', 'faces');
            
            if (fs.existsSync(facesDir)) {
                try {
                    const files = fs.readdirSync(facesDir);
                    console.log(`[SCAN] Đang quét thư mục Faces: ${facesDir}`);
                    
                    let deletedFaceCount = 0;
                    files.forEach(file => {

                        if (file.includes(employeeIdToDelete)) {
                            const fullPath = path.join(facesDir, file);
                            safeDeleteFile(fullPath);
                            deletedFaceCount++;
                        }
                    });
                    console.log(`[SCAN] Đã xóa ${deletedFaceCount} ảnh Enroll.`);
                } catch (err) {
                    console.error("[ERR] Lỗi khi quét thư mục faces:", err);
                }
            }

            const attDir = path.join(process.cwd(), 'public', 'attendance_imgs');
            
            if (fs.existsSync(attDir)) {
                try {
                    const files = fs.readdirSync(attDir);
                    console.log(`[SCAN] Đang quét thư mục ảnh chấm công: ${attDir}`);
                    
                    let deletedAttCount = 0;
                    files.forEach(file => {
                        if (file.includes(employeeIdToDelete)) {
                            const fullPath = path.join(attDir, file);
                            safeDeleteFile(fullPath);
                            deletedAttCount++;
                        }
                    });
                    console.log(`[SCAN] Đã xóa ${deletedAttCount} ảnh chấm công.`);
                } catch (err) {
                    console.error("[ERR] Lỗi khi quét thư mục ảnh chấm công:", err);
                }
            }

            await Attendance.deleteMany({ employee_id: employeeIdToDelete });
            if (Report) {
                await Report.deleteMany({ employee_id: employeeIdToDelete });
                console.log(`[DB] Đã xóa toàn bộ Report của ${employeeIdToDelete}`);
            }
        }

        if (Request) {
             await Request.deleteMany({ 
                $or: [{ employee_id: employeeIdToDelete }, { user: userObjectId }]
            });
        }
        
        await User.findByIdAndDelete(userId);

        if (req.broadcastToDevices) {
             req.broadcastToDevices(`delete:${employeeIdToDelete}`); 
             console.log(`[WS] Đã gửi lệnh delete:${employeeIdToDelete} xuống thiết bị`);
        }

        res.status(200).json({ success: true, message: "Đã xóa thành công toàn bộ dữ liệu." });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ message: "Lỗi Server", error: error.message });
    }
};

export const getUserById = async(req, res) =>{
    try{
        const user = await User.findById(req.params.id).select('-password');
        if(user){
            res.status(200).json(user);
        } else{
            res.status(404).json({message: "Nhân viên không tồn tại"});
        }
    }

    catch(error){
        res.status(500).json({
            message:"Lỗi server"
        })
    }
}

export const updateUser = async(req, res) =>{
    try{
        const user = await User.findById(req.params.id);
        if(!user){
            return res.status(404).json({message: "Nhân viên không tồn tại"});
        }
        user.name = req.body.name || user.name;
        user.account = req.body.account || user.account;
        user.role = req.body.role || user.role;
        user.employee_id = req.body.employee_id || user.employee_id;

        const updateUser = await user.save();
        res.status(200).json({
            _id: updateUser._id,
            name: updateUser.name,
            account: updateUser.account,
            role: updateUser.role,
            employee_id: updateUser.employee_id
        });
    }
    catch(error){
        res.status(500).json({
            message: "Lỗi server"
        });
    }
};



export const getUserLogs = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const logs = await AttendanceLog.find({ employee_id: user.employee_id })
      .sort({ date: -1 }) 
      .limit(30); 
      
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server' });
  }
};

export const getMyProfile = async (req, res) => {
  res.json(req.user); 
};

export const uploadMyAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!req.file) {
            return res.status(400).json({ message: 'Vui lòng chọn 1 file ảnh' });
        }
        if (user.avatar_path && !user.avatar_path.includes("default.png")) {
            safeDeleteFile(user.avatar_path);
        }
        
        const avatarPath = `/public/avatars/${req.file.filename}`;
        
        user.avatar_path = avatarPath;
        await user.save();
        
        res.status(200).json({ message: 'Upload avatar thành công', avatar_path: avatarPath });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};