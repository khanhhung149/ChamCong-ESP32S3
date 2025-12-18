import mongoose from "mongoose";

const requestSchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User',
        required: true
    },
    employee_id:{
        type: String,
        required:true
    },
    name:{
        type: String,
        required:true
    },
    requestType:{
        type: String,
        enum:['Nghỉ phép', 'Làm thêm giờ', 'Khác'],
        required:true
    },
    reason:{
        type:String,
        required:true
    },
    status:{
        type: String,
        enum:['Chờ duyệt', 'Đã duyệt', 'Từ chối'],
        default:'Chờ duyệt'
    },
    approvedBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User'
    }
},{timestamps:true});

const Request = mongoose.model('Request', requestSchema);

export default Request;