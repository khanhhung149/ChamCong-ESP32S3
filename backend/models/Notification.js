import mongoose, { mongo } from "mongoose";

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref:'User',
        required: true
    },
    message:{
        type: String,
        required: true
    },
    read:{
        type: Boolean,
        default: false
    },
    link: { 
        type: String 
    }
}, {timestamps: true});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;