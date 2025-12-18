import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const login = async (req, res) => {
    try {
        const { account, password } = req.body;

        const user = await User.findOne({ account }); 

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: "Sai Email hoặc Mật khẩu" });
        }

        const token = jwt.sign({
            _id: user._id,
            role: user.role,
            name: user.name,
            account: user.account, 
            employee_id: user.employee_id
          },
            process.env.JWT_SECRET, {expiresIn: '10d'}
        );

        res.status(200).json({
            success: true, 
            message: "Đăng nhập thành công", 
            token,
            user: { 
                _id: user._id,
                name: user.name,
                account: user.account,
                role: user.role,
                employee_id: user.employee_id
            }
        });

    } catch(error) {
        console.log(error); 
        res.status(500).json({ success: false, message: "Lỗi máy chủ nội bộ" });
    }
};

export const verifyToken =   (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: "Token hợp lệ",
        user: req.user
    });
};

