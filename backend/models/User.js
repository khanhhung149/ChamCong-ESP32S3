import mongoose from "mongoose";

const FaceVectorSchema = new mongoose.Schema({
    embedding: { type: [Number], required: true }, // Vector 512 hoặc 128 chiều
    quality: { type: Number, default: 1.0 },       // Độ rõ nét (Python trả về hoặc mặc định)
    createdAt: { type: Date, default: Date.now },
    source: { type: String, default: "esp32" }     // Nguồn: esp32, web-upload, mobile...
}, { _id: false });

const userSchema = new mongoose.Schema({
    employee_id:{type: String, required: true, unique: true},
    name:{type: String, required: true},
    avatar_path:{type: String},

    account:{type: String, required: true},
    password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['employee', 'manager', 'admin'], 
    required: true,
    default: 'employee' 
  },


  is_enrolled: { type: Boolean, default: false },
  // face_model_path: { type: String, default: "" },
  face_vector: { type: [FaceVectorSchema], default: [] }
}, {timestamps: true});



const User = mongoose.model("User",userSchema);

export default User;