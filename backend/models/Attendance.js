import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
    name:{ type: String, required: true},
    employee_id: { type: String, required: true},
    date: { type: Date, required: true },
    checkInTime: { type: Date, required: true},
    checkInImage: { type: String, required: true},
    checkOutTimeMorning: { type: Date },
    checkOutImageMorning: { type: String },
    checkInTimeAfternoon: { type: Date },
    checkInImageAfternoon: { type: String },
    checkOutTime: {type: Date},
    checkOutImage: {type: String},
    note: { type: String, default: "" },
    status: { 
        type: String, 
        default: "Đúng giờ" 
    },
    session: { type: String, enum: ['Sáng','Trưa', 'Chiều'], default: 'Sáng' },
}, { 
    timestamps: false, 
    virtuals: {
        totalHours: {
            get() {
                let totalMs = 0;
                if (this.checkInTime && this.checkOutTimeMorning) {
                    totalMs += (this.checkOutTimeMorning - this.checkInTime);
                }
                if (this.checkInTimeAfternoon && this.checkOutTime) {
                    totalMs += (this.checkOutTime - this.checkInTimeAfternoon);
                }
                if (this.checkInTime && this.checkOutTime && !this.checkOutTimeMorning && !this.checkInTimeAfternoon) {
                     totalMs = (this.checkOutTime - this.checkInTime);
                }
                return parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));
            }
        }
    },
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true } 
});

attendanceSchema.index({ employee_id: 1, date: 1 }, { unique: true });

const AttendanceLog = mongoose.model("AttendanceLog", attendanceSchema);
export default AttendanceLog;