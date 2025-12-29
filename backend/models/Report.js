import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
    employee_id: { type: String, required: true },
    name: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['Phần cứng', 'Phần mềm', 'Chấm công sai', 'Khác'], 
        default: 'Khác' 
    },
    description: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Đang chờ', 'Đang xử lý', 'Đã giải quyết'], 
        default: 'Đang chờ' 
    },
    admin_response: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

const Report = mongoose.model('Report', reportSchema);
export default Report;