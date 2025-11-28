import mongoose from "mongoose";
import { type } from "os";

const attendanceSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true
    },
    employee_id: { 
        type: String, 
        required: true 
    },
    date: {
        type: Date,
        required: true
    },
    checkInTime: {
        type: Date,
        required: true
    },
    checkInImage: {
        type: String,
        required: true
    },
    checkOutTime: {
        type: Date
    },
    checkOutImage: {
        type: String
    }
}, { 
    timestamps: false, 
    virtuals: {
        totalHours: {
            get() {
                if (this.checkInTime && this.checkOutTime) {
                    const diffMs = this.checkOutTime - this.checkInTime;
                    const hours = diffMs / (1000 * 60 * 60);
                    return parseFloat(hours.toFixed(2)); 
                }
                return null;
            }
        }
    },
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true } 
});

attendanceSchema.index({ employee_id: 1, date: 1 }, { unique: true });

const AttendanceLog = mongoose.model("AttendanceLog", attendanceSchema);
export default AttendanceLog;