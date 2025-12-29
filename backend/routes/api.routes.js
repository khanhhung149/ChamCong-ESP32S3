import express from "express";
import upload from "../middleware/upload.js";
import myAvatarUpload from "../middleware/avatarUpload.js";
import { logAttendance, getLogs, getMyLogs } from "../controllers/attendance_Controller.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { getAllUsers, createUser, deleteUser, getUserById, updateUser, getUserLogs, getMyProfile, uploadMyAvatar, updateUserEnrollStatus} from "../controllers/user_Controller.js";
import {getDashboardStats, getTodayLogs, exportLogsExcel, getWeeklyStats} from "../controllers/stats_Controller.js";
import { getMyNotifications, markAsRead } from "../controllers/notification_Controller.js";
import { 
    createRequest, 
    getMyRequests, 
    getAllRequests, 
    updateRequestStatus,
    getManagerList
} from '../controllers/request_Controller.js';
import { 
    createReport, 
    getAllReports, 
    updateReportStatus,
    getMyReports
} from '../controllers/report_Controller.js';

const router = express.Router();
// === API Thiet bi ===
router.post('/log-attendance', upload.single('image'), logAttendance);
router.put('/users/enroll-status', updateUserEnrollStatus);

// === API Báo cáo sự cố ===
router.post('/reports', protect, createReport);
router.get('/reports', protect, authorize('admin'), getAllReports);
router.put('/reports/:id', protect, authorize('admin'), updateReportStatus);
router.get('/reports/my', protect, getMyReports);

//Chung
router.get('/my-logs', protect, getMyLogs); 
router.get('/users/profile', protect, getMyProfile);
router.post('/users/profile/avatar', protect, myAvatarUpload.single('avatar'), uploadMyAvatar);
router.get('/notifications', protect, getMyNotifications);
router.put('/notifications/:id/read', protect, markAsRead);
router.post('/requests', protect, createRequest);
router.get('/requests/my', protect, getMyRequests);

// === API Thống kê (Manager) ===
router.get('/stats/weekly', protect, authorize('manager', 'admin'), getWeeklyStats);
router.get('/logs', protect, authorize('manager', 'admin'), getLogs);
router.get('/stats/dashboard', protect, authorize('manager', 'admin'), getDashboardStats);
router.get('/stats/today_logs', protect, authorize('manager', 'admin'), getTodayLogs);
router.get('/logs/export', protect, authorize('manager', 'admin'), exportLogsExcel);

// === API Quản lý Nhân viên (Manager) ===
router.route('/users')
.post(protect, authorize('manager', 'admin'), createUser)
.get(protect, authorize('manager', 'admin'), getAllUsers);
router.get('/requests', protect, authorize('manager', 'admin'), getAllRequests);
router.get('/managers', protect, getManagerList);

// === API Quản lý từng Nhân viên (Manager) ===
router.route('/users/:id')
    .get(protect, authorize('admin','manager'), getUserById)
    .put(protect, authorize('manager', 'admin'), updateUser)
    .delete(protect, authorize('admin'), deleteUser);


router.put('/requests/:id', protect, authorize('manager'), updateRequestStatus);

// API xem log của 1 user
router.get('/users/:id/logs', protect, authorize('manager', 'admin'), getUserLogs);






export default router;