import User from '../models/User.js';
import AttendanceLog from '../models/Attendance.js';
import ExcelJS from 'exceljs';

export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const totalUsers = await User.countDocuments();

    const presentIds = await AttendanceLog.distinct('employee_id', {
      date: { $gte: todayStart }, 
    });
    
    const presentToday = presentIds.length;
    const absentToday = totalUsers - presentToday;

    res.json({
      totalUsers,
      presentToday,
      absentToday,
    });

  } catch (error) {
    console.error("Lỗi trong getDashboardStats:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

export const getTodayLogs = async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        
        const logs = await AttendanceLog.find({ date: { $gte: todayStart } })
            .sort({ checkInTime: -1 }); 

        res.json(logs);

    } catch (error) {
        console.error("Lỗi trong getTodayLogs:", error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

export const exportLogsExcel = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const filter = {};
       if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0); 
            filter.date = { ...filter.date, $gte: start };
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filter.date = { ...filter.date, $lte: end };
        }
        
        const logs = await AttendanceLog.find(filter).sort({ date: -1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('BaoCaoChamCong');

        worksheet.columns = [
            { header: 'Ngày', key: 'date', width: 12 },
            { header: 'Mã NV', key: 'employee_id', width: 10 },
            { header: 'Họ Tên', key: 'name', width: 25 },
            { header: 'Vào Sáng', key: 'in_am', width: 12 },
            { header: 'Ra Trưa', key: 'out_am', width: 12 },
            { header: 'Vào Chiều', key: 'in_pm', width: 12 },
            { header: 'Ra Về', key: 'out_pm', width: 12 },
            { header: 'Tổng giờ', key: 'total', width: 10 },
            { header: 'Ghi chú / Trạng thái', key: 'note', width: 30 },
            { header: 'Link Ảnh Vào Sáng', key: 'img_in', width: 45 },
            { header: 'Link Ảnh Ra Trưa', key: 'img_out_am', width: 45 },
            { header: 'Link Ảnh Vào Chiều', key: 'img_in_pm', width: 45 },
            { header: 'Link Ảnh Ra Về', key: 'img_out', width: 45 },
        ];
        
        worksheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

        const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';
        
        const getImgUrl = (path) => path ? `http://127.0.0.1:5000${path}` : null;

        logs.forEach(log => {
           const row = worksheet.addRow({
                date: fmtDate(log.date),
                employee_id: log.employee_id,
                name: log.name,
                in_am: fmtTime(log.checkInTime),
                out_am: fmtTime(log.checkOutTimeMorning),
                in_pm: fmtTime(log.checkInTimeAfternoon),
                out_pm: fmtTime(log.checkOutTime),
                total: log.totalHours || 0,
                note: log.note || log.status,
            });

            const addLink = (cellKey, url) => {
                if (url) {
                    const cell = row.getCell(cellKey);
                    cell.value = { formula: `HYPERLINK("${url}", "Xem ảnh")` };
                    cell.font = { color: { argb: 'FF0000FF' }, underline: true };
                }
            };

            addLink('img_in', getImgUrl(log.checkInImage));
            addLink('img_out_am', getImgUrl(log.checkOutImageMorning));
            addLink('img_in_pm', getImgUrl(log.checkInImageAfternoon));
            addLink('img_out', getImgUrl(log.checkOutImage));
        });

        let fileName = 'BaoCaoChamCong.xlsx'; 
        if (startDate || endDate) {
            fileName = `BaoCao_${startDate || 'Start'}_den_${endDate || 'End'}.xlsx`;
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Lỗi server khi xuất Excel" });
    }
}

export const getWeeklyStats = async (req, res) => {
    try {
        const stats = [];
        const totalUsers = await User.countDocuments({ role: 'employee' });

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            
            const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
            const nextDay = new Date(startOfDay);
            nextDay.setDate(startOfDay.getDate() + 1);

            const logs = await AttendanceLog.find({
                date: { $gte: startOfDay, $lt: nextDay }
            });

            const present = logs.length;
            const lateOrIssue = logs.filter(l => 
                l.note && (/trễ/i.test(l.note) || /Vắng/i.test(l.note))
            ).length;
            const onTime = Math.max(0, present - lateOrIssue);
            
            const dayStr = `${d.getDate()}/${d.getMonth() + 1}`;

            stats.push({
                date: dayStr,
                onTime,
                late: lateOrIssue,
                present 
            });
        }

        res.json(stats);
    } catch (error) {
        console.error("Lỗi getWeeklyStats:", error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};