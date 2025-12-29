import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

const DeviceConfigPage = () => {
    const { sendWsMessage, lastJsonMessage, deviceCount } = useWebSocket();
    const [statusMsg, setStatusMsg] = useState('');

    // State lưu 3 khung giờ: Sáng, Chiều, Tối
    const [slots, setSlots] = useState([
        { name: "Ca sáng", start: "07:00", end: "08:15" },
        { name: "Ca chiều", start: "11:00", end: "12:00" },
        { name: "Tăng ca (Tối)", start: "17:00", end: "21:00" }
    ]);

    // Lắng nghe phản hồi từ ESP32
    useEffect(() => {
        if (lastJsonMessage && lastJsonMessage.type === 'config_success') {
            setStatusMsg('✅ Thiết bị đã lưu cấu hình thành công!');
            setTimeout(() => setStatusMsg(''), 5000); // Tự tắt sau 5s
        }
    }, [lastJsonMessage]);

    const handleTimeChange = (index, field, value) => {
        const newSlots = [...slots];
        newSlots[index][field] = value;
        setSlots(newSlots);
    };

    const handleSaveConfig = () => {
        if (deviceCount === 0) {
            alert("⚠️ Thiết bị đang Offline! Vui lòng bật thiết bị trước.");
            return;
        }

        const configData = slots.map(slot => {
            const [sH, sM] = slot.start.split(':').map(Number);
            const [eH, eM] = slot.end.split(':').map(Number);
            return [sH, sM, eH, eM]; 
        });

        const payload = {
            type: "config_time",
            data: configData
        };

        sendWsMessage(JSON.stringify(payload));
        setStatusMsg('Đang gửi xuống thiết bị...');
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Cấu hình thiết bị</h1>
                <span className={`px-3 py-1 rounded-full text-white text-sm ${deviceCount > 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                    {deviceCount > 0 ? 'Device Online' : 'Device Offline'}
                </span>
            </div>

            <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                <h2 className="text-lg font-semibold mb-4 text-blue-700">Thiết lập khung giờ hoạt động</h2>
                <p className="text-sm text-gray-500 mb-6">
                    Thiết bị sẽ tự động ngủ sâu khi nằm ngoài các khung giờ này để tiết kiệm năng lượng.
                </p>

                <div className="space-y-4">
                    {slots.map((slot, index) => (
                        <div key={index} className="flex flex-col md:flex-row items-center gap-4 p-4 bg-gray-50 rounded border">
                            <span className="font-medium text-gray-700 w-32">{slot.name}</span>
                            
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">Mở:</label>
                                <input 
                                    type="time" 
                                    value={slot.start}
                                    onChange={(e) => handleTimeChange(index, 'start', e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>
                            <span className="text-gray-400">đến</span>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">Tắt:</label>
                                <input 
                                    type="time" 
                                    value={slot.end}
                                    onChange={(e) => handleTimeChange(index, 'end', e.target.value)}
                                    className="border rounded px-2 py-1"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {statusMsg && (
                    <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded text-center font-medium">
                        {statusMsg}
                    </div>
                )}

                <div className="mt-6 text-right">
                    <button 
                        onClick={handleSaveConfig}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded shadow transition-colors"
                    >
                        Lưu xuống thiết bị
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeviceConfigPage;