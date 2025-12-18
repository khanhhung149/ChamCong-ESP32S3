// Script test khả năng chịu tải của thuật toán tìm kiếm
const vectorSize = 512;
const totalUsers = 10000; // Thử thay đổi số này: 1000, 5000, 10000

// 1. Tạo dữ liệu giả
console.log(`Đang tạo ${totalUsers} nhân viên giả lập...`);
const users = [];
for (let i = 0; i < totalUsers; i++) {
    users.push({
        name: `User ${i}`,
        face_vector: Array.from({length: vectorSize}, () => Math.random())
    });
}
const inputVector = Array.from({length: vectorSize}, () => Math.random());

// 2. Đo thời gian tìm kiếm
console.time("SearchTime");
let minDist = Infinity;
let foundUser = null;

// Giả lập logic trong controller của bạn
for (const user of users) {
    // Tính Euclidean distance
    let sum = 0;
    for (let j = 0; j < vectorSize; j++) {
        let diff = inputVector[j] - user.face_vector[j];
        sum += diff * diff;
    }
    let dist = Math.sqrt(sum);
    
    if (dist < minDist) {
        minDist = dist;
        foundUser = user;
    }
}
console.timeEnd("SearchTime");