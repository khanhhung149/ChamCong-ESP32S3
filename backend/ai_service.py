from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from deepface import DeepFace
import time
import base64
import numpy as np
import cv2
import uvicorn
import os
from typing import List

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

app = FastAPI()
MODEL_NAME = "ArcFace" 

# Nhận một danh sách các ảnh (Batch 3 frames)
class BatchImageRequest(BaseModel):
    images: List[str] 

def base64_to_cv2(base64_string):
    try:
        if "," in base64_string:
            base64_string = base64_string.split(",")[1]
        decoded_data = base64.b64decode(base64_string)
        np_data = np.frombuffer(decoded_data, np.uint8)
        img = cv2.imdecode(np_data, cv2.IMREAD_COLOR)
        return img
    except:
        return None

def calculate_euclidean_distance(source_representation, test_representation):
    euclidean_distance = source_representation - test_representation
    euclidean_distance = np.sum(np.multiply(euclidean_distance, euclidean_distance))
    euclidean_distance = np.sqrt(euclidean_distance)
    return euclidean_distance

def check_spoofing(img_cv2):
    """
    Trả về True nếu là MẶT THẬT
    Trả về False nếu nghi ngờ là GIẢ (Màn hình/Ảnh in)
    """
    # 1. Kiểm tra độ sắc nét (Laplacian Variance)
    # Màn hình điện thoại thường mờ hơn hoặc có vân sọc (Moiré)
    gray = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    print(f"🔍 Laplacian Score: {laplacian_var:.2f}")

    # Ngưỡng này cần tinh chỉnh tùy camera (OV5640 nét thì ngưỡng cao hơn)
    # Ảnh mờ (blur) < 50-100. Ảnh sắc nét (da thật) thường > 150
    if laplacian_var < 80: 
        return False, "Ảnh quá mờ (Khả năng là màn hình)"
    
    if laplacian_var > 3000:
        return False, "Ảnh quá nhiễu (Khả năng là vân sọc màn hình)"

    # 2. Kiểm tra Histogram (Độ chói)
    # Màn hình thường bị cháy sáng hoặc thiếu độ sâu màu
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    
    # Đếm số pixel quá sáng (cháy sáng > 250)
    bright_pixels = np.sum(hist[250:])
    total_pixels = gray.shape[0] * gray.shape[1]
    bright_ratio = bright_pixels / total_pixels

    if bright_ratio > 0.1: # Nếu hơn 10% ảnh bị trắng xóa
        return False, "Chói sáng (Khả năng là màn hình phát sáng)"

    return True, "OK"

@app.post("/extract_vector_batch")
async def extract_vector_batch(req: BatchImageRequest):
    start_time = time.time()
    # Node.js đã đảm bảo gửi đủ số lượng (3 hoặc 5)
    images = req.images 
    vectors = []

    # 1. Extract Vector từng ảnh
    deepface_start = time.time()
    for b64 in images:
        img = base64_to_cv2(b64)
        if img is None: continue
        try:
            # DeepFace detect & align & embed
            emb = DeepFace.represent(img, model_name="ArcFace", enforce_detection=True)
            vectors.append(np.array(emb[0]["embedding"]))
        except:
            continue

    deepface_end = time.time()
    print(f"🧠 DeepFace Core: {(deepface_end - deepface_start) * 1000:.2f} ms")
    
    if len(vectors) == 0:
        return {"success": False, "message": "No face found"}

    # 2. Check Liveness (Variance)
    # Nếu batch >= 2 ảnh thì mới tính được độ lệch chuẩn
    liveness = True
    dist_avg = 0.0
    
    if len(vectors) >= 2:
        dists = []
        for i in range(len(vectors)-1):
            d = calculate_euclidean_distance(vectors[i], vectors[i+1])
            dists.append(d)
        dist_avg = np.mean(dists)
        
        # Logic Liveness
        if dist_avg < 0.02: liveness = False # Fake (Ảnh tĩnh)
        if dist_avg > 0.3: liveness = False  # Mờ/Nhiễu quá

    # 3. Tính Vector trung bình (Mean Pooling)
    avg_vector = np.mean(vectors, axis=0).tolist()

    total_time = time.time() - start_time
    print(f"⚡ Total Python API: {total_time * 1000:.2f} ms")

    return {
        "success": True,
        "vector": avg_vector,
        "liveness": liveness,
        "debug_score": dist_avg
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)