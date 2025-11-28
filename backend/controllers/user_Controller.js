import User from '../models/User.js';
import bcrypt from 'bcrypt';
import AttendanceLog from '../models/Attendance.js';

export const resetAllEnrollment = async (req, res) => {
    try {
        await User.updateMany(
            {}, 
            { $set: { is_enrolled: false } } 
        );
        res.status(200).json({ message: "Đã reset trạng thái enrollment cho tất cả user." });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Lỗi server khi reset enrollment",
            error: error.message
        });
    }
};

export const updateUserEnrollStatus = async (req, res) => {
    const { employee_id, is_enrolled } = req.body;
    try{
        const user =await User.findOne({employee_id});
        if(!user){
            return  res.status(404).json({message: "Nhân viên không tồn tại"});
        }
        user.is_enrolled = is_enrolled;
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

export const createUser = async (req, res) =>{
    const {name, email, password, role} = req.body;
    try{
        if(!name || !email || !password || !role){
            return res.status(400).json({message: "Vui lòng điền đầy đủ thông tin"})
        }

        let newEmployeeId = "NV001"

        const lastUser = await User.findOne().sort({ createdAt: -1 });

        if (lastUser && lastUser.employee_id) {
            // Lấy phần số từ mã cũ (VD: "NV005" -> "005")
            const currentIdStr = lastUser.employee_id.replace("NV", ""); 
            const currentIdNum = parseInt(currentIdStr);

            if (!isNaN(currentIdNum)) {
                // Cộng thêm 1
                const nextIdNum = currentIdNum + 1;
                // Format lại thành 3 chữ số (VD: 6 -> "006")
                newEmployeeId = "NV" + nextIdNum.toString().padStart(3, "0");
            }
        }
        console.log("Đang tạo nhân viên mới với ID:", newEmployeeId);

        const emailExists = await User.findOne({email});
        if(emailExists){
            return res.status(400).json({message: "Email đã được sử dụng"});
        }
        

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            employee_id: newEmployeeId,
            email,
            password: hashedPassword,
            role
        });

        const savedUser = await newUser.save();

        res.status(201).json({
            _id: savedUser._id,
            name: savedUser.name,
            email: savedUser.email,
            role: savedUser.role,
            employee_id: savedUser.employee_id
        })
    }
    catch(error){
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
};

export const getAllUsers = async(req, res) =>{
    try{
        const users = await User.find({}).select('-password').sort({createdAt: -1});
        res.status(200).json(users);
    }

    catch(error){
        console.log(error);
        res.status(500).json({
            message: "Lỗi server",
            error: error.message
        });
    }
}

export const deleteUser = async(req, res) =>{
    try{
        const user = await User.findById(req.params.id);
        if(user){
            await AttendanceLog.deleteMany({ employee_id: user.employee_id });
            await user.deleteOne();
            res.status(200).json({message: "Xóa thành công"});
        }
        else{
            res.status(404).json({message: "Nhân viên không tồn tại"});
        }
    }
    catch(error){
        res.status(500).json({
            message: 'Lỗi server', 
            error: error.message
        })
    }
}

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
        user.email = req.body.email || user.email;
        user.role = req.body.role || user.role;
        user.employee_id = req.body.employee_id || user.employee_id;

        const updateUser = await user.save();
        res.status(200).json({
            _id: updateUser._id,
            name: updateUser.name,
            email: updateUser.email,
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
        
        const avatarPath = `/public/avatars/${req.file.filename}`;
        
        user.avatar_path = avatarPath;
        await user.save();
        
        res.status(200).json({ message: 'Upload avatar thành công', avatar_path: avatarPath });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};