import Request from '../models/Request.js';
import User from '../models/User.js';
import { createAndSendNotification } from './notification_Controller.js';
import axios from 'axios';


export const createRequest = async(req, res) =>{
    try{
        const {requestType, reason} = req.body;
        if(!requestType || !reason){
            return res.status(400).json({message:'Vui lòng điền đầy đủ thông tin'});
        }
        const newRequest = new Request({
            user: req.user._id,
            employee_id: req.user.employee_id,
            name: req.user.name,
            requestType: requestType,
            reason: reason,
            status:'Chờ duyệt'
        });
        await newRequest.save();

        const activeConnectionsMap = req.getActiveConnections(); 
        
        const protocol = req.protocol;
        const host = req.get('host');
        const token = req.headers.authorization; 
        
        const managers = await axios.get(`${protocol}://${host}/api/managers`, {
            headers: { 'Authorization': token }
        });

        for (const manager of managers.data){
            createAndSendNotification(
                activeConnectionsMap,
                manager._id,
                `Nhân viên ${req.user.name} vừa gửi một yêu cầu ${requestType}.`,
                `/manager/requests`
            );
        }
        
        res.status(201).json({newRequest});

    }
    catch(error){   
        console.error("Lỗi khi tạo request:", error.message); 
        res.status(500).json({ message: "Lỗi server" });
    }
};

export const getMyRequests = async(req,res) =>{
    try{
        const requests = await Request.find({user: req.user._id}).sort({createdAt:-1});
        res.json(requests);
    }
    catch(error){
        console.error("Lỗi khi lấy my requests:", error.message); 
        res.status(500).json({ message: "Lỗi server" });
    }
};

export const getAllRequests = async(req,res) =>{
    try{
        const requests = await Request.find({}).sort({createdAt: -1});
        res.json(requests);
    }
    catch(error){
        res.status(500).json({ message: "Lỗi server" });
    }
};

export const getManagerList = async(req,res) =>{
    try{
        const managers = await User.find({role:'manager'}).select('_id');
        res.json(managers);
    }
    catch(error){
        res.status(500).json({ message: "Lỗi server" });
    }
}

export const updateRequestStatus = async(req,res) =>{
    try{
        const {status} =req.body;
        if(!status){
            return res.status(400).json({message:'Vui lòng cung cấp trạng thái mới'});
        }

        const request = await Request.findById(req.params.id);
        if(!request){
            return res.status(404).json({message:'Không tìm thấy yêu cầu'});
        }
        request.status = status;
        request.approvedBy = req.user._id;
        await request.save();

        const activeConnectionsMap = req.getActiveConnections();

        createAndSendNotification(
            activeConnectionsMap,
            request.user,
            `Yêu cầu ${request.requestType} của bạn đã được ${status=== 'Đã duyệt' ? 'đồng ý' : 'từ chối'}.`,
            `/employee/requests/`
        );
        res.json(request);
    }
    catch(error){
        console.error("Lỗi khi cập nhật request:", error.message);
        res.status(500).json({ message: "Lỗi server" });
    }
}
