import multer from 'multer';
import path from 'path';
import fs from 'fs';

const avatarDir = './public/avatars';
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir); 
  },
  filename: (req, file, cb) => {
    if (!req.user || !req.user.employee_id) {
      return cb(new Error('User not authenticated or missing employee_id'));
    }
    
    const fileExt = path.extname(file.originalname);
    
    const fileName = req.user.employee_id + fileExt;
    
    cb(null, fileName);
  },
});

const myAvatarUpload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh!'), false);
    }
  },
});

export default myAvatarUpload;