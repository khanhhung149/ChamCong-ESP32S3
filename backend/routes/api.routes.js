import { Router } from "express";
import upload from "../middleware/upload.js";
import myAvatarUpload from "../middleware/avatarUpload.js";
import { logAttendance, getLogs, getMyLogs } from "../controllers/attendance_Controller.js";
import { protect, isManager } from "../middleware/authMiddleware.js";
import { getAllUsers, createUser, deleteUser, getUserById, updateUser, getUserLogs, getMyProfile, uploadMyAvatar, updateUserEnrollStatus, resetAllEnrollment} from "../controllers/user_Controller.js";
import {getDashboardStats, getTodayLogs, exportLogsExcel} from "../controllers/stats_Controller.js";
import { getMyNotifications, markAsRead } from "../controllers/notification_Controller.js";
import { 
    createRequest, 
    getMyRequests, 
    getAllRequests, 
    updateRequestStatus,
    getManagerList
} from '../controllers/request_Controller.js';

const router = Router();
// === API Kiosk ===
router.post('/log-attendance', upload.single('image'), logAttendance);
router.put('/users/enroll-status', updateUserEnrollStatus);

//Chung
router.get('/my-logs', protect, getMyLogs); 
router.get('/users/profile', protect, getMyProfile);
router.post('/users/profile/avatar', protect, myAvatarUpload.single('avatar'), uploadMyAvatar);
router.get('/notifications', protect, getMyNotifications);
router.put('/notifications/:id/read', protect, markAsRead);
router.post('/requests', protect, createRequest);
router.get('/requests/my', protect, getMyRequests);

// === API Thống kê (Manager) ===
router.get('/logs', protect, isManager, getLogs);
router.get('/stats/dashboard', protect, isManager, getDashboardStats);
router.get('/stats/today_logs', protect, isManager, getTodayLogs);
router.get('/logs/export', protect, isManager, exportLogsExcel);

// === API Quản lý Nhân viên (Manager) ===
router.route('/users')
.post(protect, isManager, createUser)
.get(protect, isManager, getAllUsers);
router.post('/users/reset-all-enrollment', protect, isManager, resetAllEnrollment);
router.get('/requests', protect, isManager, getAllRequests);
router.get('/managers', protect, getManagerList);

// === API Quản lý từng Nhân viên (Manager) ===
router.route('/users/:id')
    .get(protect, isManager, getUserById)
    .put(protect, isManager, updateUser)
    .delete(protect, isManager, deleteUser);
router.put('/requests/:id', protect, isManager, updateRequestStatus);

// API xem log của 1 user
router.get('/users/:id/logs', protect, isManager, getUserLogs);

export default router;