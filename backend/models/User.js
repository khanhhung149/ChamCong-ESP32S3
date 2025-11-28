import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    employee_id:{type: String, required: true, unique: true},
    name:{type: String, required: true},
    avatar_path:{type: String},

    email:{type: String, required: true},
    password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['employee', 'manager'], 
    required: true,
    default: 'employee' 
  },


  is_enrolled: { type: Boolean, default: false }
}, {timestamps: true});



const User = mongoose.model("User",userSchema);

export default User;