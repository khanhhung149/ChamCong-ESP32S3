import express from "express";
// Chú ý: Đảm bảo tên file controller trùng khớp với file bạn đang có (ai_Controller.js hay ai_controller.js)
import { recognizeFace, enrollFace } from "../controllers/ai_Controller.js"; 

const router = express.Router();

// Định nghĩa đường dẫn
// ESP32 gọi: /api/ai/recognize -> chạy hàm recognizeFace
router.post("/recognize", recognizeFace);

// ESP32 gọi: /api/ai/enroll -> chạy hàm enrollFace
router.post("/enroll", enrollFace);

export default router;