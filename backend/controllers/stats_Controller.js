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

export const exportLogsExcel = async (req,res) =>{
  const {startDate, endDate} = req.query;
  try{
    const filter ={};
    if(startDate && endDate){
      filter.date = {$gte: new Date(startDate), $lte: new Date(endDate)};
    }
    else if(startDate){
      filter.date = {$gte: new Date(startDate)};
    }
    else if(endDate){
      filter.date = {$lte: new Date(endDate)};
    }
    const logs = await AttendanceLog.find(filter).sort({date: -1});

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BaoCaoChamCong');

    worksheet.columns =[
      {header: 'Tên', key:'name', width: 30},
      {header: 'Mã NV', key: 'employee_id', width: 15},
      { header: 'Ngày', key: 'date', width: 15 },
      { header: 'Giờ vào', key: 'checkInTime', width: 15 },
      { header: 'Giờ ra', key: 'checkOutTime', width: 15 },
      { header: 'Tổng giờ', key: 'totalHours', width: 10 }
    ];

    for (const log of logs){

      const dateVN = new Date(log.date).toLocaleDateString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh', 
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
      });
      const checkInVN = log.checkInTime 
          ? new Date(log.checkInTime).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) 
          : '';
          
      const checkOutVN = log.checkOutTime 
          ? new Date(log.checkOutTime).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) 
          : '';
      worksheet.addRow({
        name: log.name,
        employee_id: log.employee_id,
        date: dateVN,
        checkInTime: checkInVN,
        checkOutTime: checkOutVN,
        totalHours: log.totalHours || 'N/A'
      });
    }

    let fileName = 'BaoCaoChamCong.xlsx'; 
        if (startDate && endDate) {
            fileName = `BaoCao_${startDate}_den_${endDate}.xlsx`;
        } else if (startDate) {
            fileName = `BaoCao_tu_${startDate}.xlsx`;
        } else if (endDate) {
            fileName = `BaoCao_den_${endDate}.xlsx`;
        }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + fileName
    );

    await workbook.xlsx.write(res);
    res.end();
  }
  catch(error){
    console.log(error);
    res.status(500).json({ message: "Lỗi server khi xuất Excel" });
  }
}