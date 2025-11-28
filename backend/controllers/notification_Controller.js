import Notification from "../models/Notification.js";

export const createAndSendNotification = async(activeConnections, userId, message, link ='') =>{
    try{
        const newNotif = new Notification({
            user: userId,
            message: message,
            link: link
        });
        await newNotif.save();
        const ws = activeConnections.get(userId.toString());

        if(ws && ws.readyState === ws.OPEN){
            ws.send(JSON.stringify({
                type: 'new_notification',
                data: newNotif
            }));
        }
    }
    catch(error){
        console.error('Lỗi khi gửi thông báo', error);
    }
};

export const getMyNotifications = async(req, res) =>{
    try{
        const notifs = await Notification.find({user: req.user._id, read: false}).sort({createdAt: -1});
        res.json(notifs);
    }
    catch(error){
        res.status(500).json({ message: "Lỗi server" });
    }
};

export const markAsRead = async(req, res) =>{
    try{
        const notif = await Notification.findById(req.params.id);
        if(notif.user.toString() !== req.user._id.toString()){
            return res.status(403).json({message: "Không có quyền"});
        }
        notif.read = true; 
        await notif.save();
        res.json(notif);
    }
    catch(error){
        res.status(500).json({ message: "Lỗi server" });
    }
}