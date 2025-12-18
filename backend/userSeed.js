import User from "./models/User.js";
import bcrypt from "bcrypt";
import connectDB  from "./config/db.js";

const userRegister = async()=>{
    try{
        connectDB();
        const adminAccount = 'admin';
        const adminExists = await User.findOne({account: adminAccount});
        if(!adminExists){
            const hashPassword = await bcrypt.hash("admin123",10);
            const admin = new User({
                name: "Administrator",
                employee_id: "ADMIN01",
                account: adminAccount,
                password: hashPassword,
                role: "admin",
                is_enrolled: true // Admin mặc định đã enroll (hoặc không cần chấm công)
            });
            await admin.save();
        console.log("✅ Đã tạo tài khoản Admin thành công!");
        } else {
            console.log("⚠️ Tài khoản Admin đã tồn tại.");
        }
        
    }catch(error){
        console.log(error);
    }
}

userRegister();