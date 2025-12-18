import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) =>{
    let token;

    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
        try{
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded._id).select('-password');
            next();
    }
    catch(error){
        console.log(error);
        res.status(401).json({
            success:false,
            message:"Token không hợp lệ"
        });
        return;
        }
    }
    if(!token){
        res.status(401).json({
            success:false,
            message:"Không có token, truy cập bị từ chối"
        });
        return;
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Quyền hạn '${req.user ? req.user.role : 'none'}' không được phép truy cập.`
            });
        }
        next();
    };
};

export { protect, authorize };
