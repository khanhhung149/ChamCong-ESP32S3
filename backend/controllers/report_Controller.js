import Report from '../models/Report.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js'; 
export const createReport = async (req, res) => {
    try {
        const { employee_id, name, type, description } = req.body;
        
        const newReport = new Report({
            employee_id,
            name,
            type,
            description
        });
        const savedReport = await newReport.save();

        
        const notiContent = `Sự cố mới từ ${req.user.name}: ${type}`;
        
        const admins = await User.find({ role: 'admin' });


        if (admins.length > 0) {
            const notificationPromises = admins.map(admin => {
                return new Notification({
                    user: admin._id,       
                    message: notiContent,
                    type: "incident",
                    link: "/admin/incidents",
                    relatedId: savedReport._id,
                    isRead: false,
                    createdAt: new Date()
                }).save();
            });
            await Promise.all(notificationPromises);
        }

        if (req.broadcastToAdmins) {
            req.broadcastToAdmins({
                type: 'new_notification',
                data: {
                    _id: new Date().getTime().toString(),
                    message: notiContent,
                    link: "/admin/incidents",
                    createdAt: new Date(),
                    isRead: false
                }
            });
        }

        res.status(201).json(savedReport);

    } catch (error) {
        console.error("Create Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAllReports = async (req, res) => {
    try {
        const reports = await Report.find().sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateReportStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_response } = req.body;

        await Report.findByIdAndUpdate(id, { status, admin_response });
        res.json({ success: true, message: "Đã cập nhật trạng thái!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getMyReports = async (req, res) => {
    try {
        const reports = await Report.find({ employee_id: req.user.employee_id })
                                    .sort({ createdAt: -1 }); 
        res.json(reports);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};