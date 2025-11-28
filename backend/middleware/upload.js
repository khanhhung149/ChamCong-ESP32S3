import multer from "multer";
import path from "path";


const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, 'public/attendance_imgs/');
    },
    filename: function(req, file, cb){
        const employeeId = req.body.employee_id || 'unknown';
        let orig = file.originalname || '';
        orig = path.basename(orig); 
        orig = orig.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (orig && orig.length > 0) {
            cb(null, orig);
        } else {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const extension = path.extname(file.originalname) || '.jpg';
            cb(null, `${employeeId}-${uniqueSuffix}${extension}`);
        }
    }
});

const fileFilter = (req, file, cb) =>{
    if(file.mimetype.startsWith('image/')) {
        cb(null, true);
    }
    else{ 
        cb(new Error('Chi chap nhan file anh'), false);
    }
};

const upload = multer({storage: storage, fileFilter: fileFilter});

export default upload;