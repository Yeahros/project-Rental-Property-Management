const pool = require('../config/database');
const jwt = require('jsonwebtoken');

// Helper function để lấy tenant_id từ token
const getTenantIdFromToken = (req) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'tenant') return null;
        return decoded.id;
    } catch (err) {
        return null;
    }
};

// Tổng quan phòng trọ hiện tại
const getOverview = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const roomId = req.query.room_id;
        let sql = `
            SELECT 
                c.contract_id,
                c.start_date,
                c.end_date,
                c.rent_amount,
                c.deposit_amount,
                c.status,
                r.room_id,
                r.room_number,
                r.floor,
                r.area_m2,
                r.base_rent,
                r.facilities,
                h.house_id,
                h.house_name,
                h.address
            FROM contracts c
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE c.tenant_id = ? 
                AND c.status = 'Active'
                AND c.is_current = 1
        `;
        
        const params = [tenantId];
        
        // Nếu có room_id, lấy phòng cụ thể đó
        if (roomId) {
            sql += ` AND r.room_id = ?`;
            params.push(roomId);
        }
        
        sql += ` ORDER BY c.start_date DESC LIMIT 1`;
        
        // Lấy hợp đồng đang hoạt động của tenant
        const [contracts] = await pool.query(sql, params);

        if (contracts.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy phòng trọ đang thuê' });
        }

        const contract = contracts[0];

        res.json({
            contract_id: contract.contract_id,
            room: {
                room_id: contract.room_id,
                room_number: contract.room_number,
                floor: contract.floor,
                area_m2: contract.area_m2,
                base_rent: contract.base_rent,
                facilities: contract.facilities
            },
            house: {
                house_id: contract.house_id,
                house_name: contract.house_name,
                address: contract.address
            },
            contract: {
                start_date: contract.start_date,
                end_date: contract.end_date,
                rent_amount: contract.rent_amount,
                deposit_amount: contract.deposit_amount,
                status: contract.status
            }
        });
    } catch (err) {
        console.error('Get Overview Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin tổng quan', error: err.message });
    }
};

// Danh sách phòng đang thuê (để chuyển phòng)
const getRooms = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const [rooms] = await pool.query(`
            SELECT 
                c.contract_id,
                r.room_id,
                r.room_number,
                r.floor,
                h.house_name,
                h.address,
                c.start_date,
                c.end_date,
                c.status,
                c.is_current
            FROM contracts c
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE c.tenant_id = ? 
                AND c.status = 'Active'
            ORDER BY c.is_current DESC, c.start_date DESC
        `, [tenantId]);

        res.json(rooms);
    } catch (err) {
        console.error('Get Rooms Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách phòng', error: err.message });
    }
};

// Chi phí hàng tháng (doanh thu từ góc nhìn tenant)
const getMonthlyExpenses = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { room_id } = req.query; // Optional: filter by room

        let sql = `
            SELECT 
                MONTH(i.issue_date) AS month,
                YEAR(i.issue_date) AS year,
                SUM(i.total_amount) AS total_expense,
                COUNT(i.invoice_id) AS invoice_count
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            WHERE c.tenant_id = ?
        `;

        const params = [tenantId];

        if (room_id) {
            sql += ` AND c.room_id = ?`;
            params.push(room_id);
        }

        sql += `
            AND YEAR(i.issue_date) = YEAR(CURRENT_DATE())
            GROUP BY YEAR(i.issue_date), MONTH(i.issue_date)
            ORDER BY YEAR(i.issue_date) DESC, MONTH(i.issue_date) DESC
            LIMIT 12
        `;

        const [rows] = await pool.query(sql, params);

        // Chuẩn hóa thành 12 tháng
        const months = [];
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        for (let i = 11; i >= 0; i--) {
            let month = currentMonth - i;
            let year = currentYear;
            if (month <= 0) {
                month += 12;
                year -= 1;
            }

            const data = rows.find(r => r.month === month && r.year === year);
            months.push({
                month: month,
                year: year,
                total_expense: data ? parseFloat(data.total_expense) || 0 : 0,
                invoice_count: data ? data.invoice_count : 0
            });
        }

        res.json(months);
    } catch (err) {
        console.error('Get Monthly Expenses Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi phí hàng tháng', error: err.message });
    }
};

// Mức sử dụng điện và nước
const getUtilityUsage = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const room_id = req.query.room_id ? parseInt(req.query.room_id) : null; // Optional: filter by room
        const { type } = req.query; // 'electricity' or 'water' - nhưng database không có cột này, nên lấy tất cả

        // Lấy dữ liệu điện (dựa trên service_name trong items khi tạo invoice)
        // Vì invoice_details không có service_name, ta cần join với invoices và xem items
        // Tạm thời, ta sẽ lấy tất cả và phân biệt dựa trên thứ tự (item đầu = điện, item thứ 2 = nước)
        // Hoặc có thể dùng cách khác: lấy 2 items đầu tiên của mỗi invoice
        
        // Query cho điện (lấy item đầu tiên của mỗi invoice trong tháng)
        let sqlElectricity = `
            SELECT 
                MONTH(inv.issue_date) AS month,
                YEAR(inv.issue_date) AS year,
                SUM(GREATEST(id.current_reading - COALESCE(id.previous_reading, 0), 0)) AS total_usage,
                COUNT(DISTINCT id.usage_id) AS reading_count
            FROM invoice_details id
            JOIN invoices inv ON id.invoice_id = inv.invoice_id
            JOIN contracts c ON inv.contract_id = c.contract_id
            WHERE c.tenant_id = ?
                AND id.current_reading IS NOT NULL
                AND id.previous_reading IS NOT NULL
                AND (
                    SELECT COUNT(*) 
                    FROM invoice_details id2 
                    WHERE id2.invoice_id = id.invoice_id 
                    AND id2.usage_id <= id.usage_id
                ) = 1
        `;

        // Query cho nước (lấy item thứ 2 của mỗi invoice trong tháng)
        let sqlWater = `
            SELECT 
                MONTH(inv.issue_date) AS month,
                YEAR(inv.issue_date) AS year,
                SUM(GREATEST(id.current_reading - COALESCE(id.previous_reading, 0), 0)) AS total_usage,
                COUNT(DISTINCT id.usage_id) AS reading_count
            FROM invoice_details id
            JOIN invoices inv ON id.invoice_id = inv.invoice_id
            JOIN contracts c ON inv.contract_id = c.contract_id
            WHERE c.tenant_id = ?
                AND id.current_reading IS NOT NULL
                AND id.previous_reading IS NOT NULL
                AND (
                    SELECT COUNT(*) 
                    FROM invoice_details id2 
                    WHERE id2.invoice_id = id.invoice_id 
                    AND id2.usage_id <= id.usage_id
                ) = 2
        `;

        const params = [tenantId];
        const paramsWater = [tenantId];

        if (room_id && !isNaN(room_id)) {
            sqlElectricity += ` AND c.room_id = ?`;
            sqlWater += ` AND c.room_id = ?`;
            params.push(room_id);
            paramsWater.push(room_id);
        }

        sqlElectricity += `
            AND YEAR(inv.issue_date) = YEAR(CURRENT_DATE())
            GROUP BY YEAR(inv.issue_date), MONTH(inv.issue_date)
            ORDER BY YEAR(inv.issue_date) DESC, MONTH(inv.issue_date) DESC
            LIMIT 6
        `;
        
        sqlWater += `
            AND YEAR(inv.issue_date) = YEAR(CURRENT_DATE())
            GROUP BY YEAR(inv.issue_date), MONTH(inv.issue_date)
            ORDER BY YEAR(inv.issue_date) DESC, MONTH(inv.issue_date) DESC
            LIMIT 6
        `;

        const [rowsElectricity] = await pool.query(sqlElectricity, params);
        const [rowsWater] = await pool.query(sqlWater, paramsWater);

        // Chuẩn hóa thành 6 tháng gần nhất cho điện
        const monthsElectricity = [];
        const monthsWater = [];
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        for (let i = 5; i >= 0; i--) {
            let month = currentMonth - i;
            let year = currentYear;
            if (month <= 0) {
                month += 12;
                year -= 1;
            }

            const dataElec = rowsElectricity.find(r => parseInt(r.month) === month && parseInt(r.year) === year);
            const dataWater = rowsWater.find(r => parseInt(r.month) === month && parseInt(r.year) === year);
            
            monthsElectricity.push({
                month: month,
                year: year,
                usage: dataElec ? parseFloat(dataElec.total_usage) || 0 : 0,
                total_usage: dataElec ? parseFloat(dataElec.total_usage) || 0 : 0,
                reading_count: dataElec ? parseInt(dataElec.reading_count) || 0 : 0
            });
            
            monthsWater.push({
                month: month,
                year: year,
                usage: dataWater ? parseFloat(dataWater.total_usage) || 0 : 0,
                total_usage: dataWater ? parseFloat(dataWater.total_usage) || 0 : 0,
                reading_count: dataWater ? parseInt(dataWater.reading_count) || 0 : 0
            });
        }

        res.json({
            electricity: monthsElectricity,
            water: monthsWater
        });
    } catch (err) {
        console.error('Get Utility Usage Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy mức sử dụng', error: err.message });
    }
};

// Thanh toán gần đây
const getRecentPayments = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { room_id, limit = 5 } = req.query;

        let sql = `
            SELECT 
                i.invoice_id,
                i.billing_period,
                i.issue_date,
                i.paid_date,
                i.total_amount,
                i.status,
                r.room_number,
                h.house_name
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE c.tenant_id = ?
                AND i.status = 'Paid'
        `;

        const params = [tenantId];

        if (room_id) {
            sql += ` AND c.room_id = ?`;
            params.push(room_id);
        }

        sql += ` ORDER BY i.paid_date DESC LIMIT ?`;
        params.push(parseInt(limit));

        const [rows] = await pool.query(sql, params);

        res.json(rows);
    } catch (err) {
        console.error('Get Recent Payments Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy thanh toán gần đây', error: err.message });
    }
};

// Yêu cầu bảo trì theo phòng trọ
const getMaintenanceRequests = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { room_id, status, limit = 10 } = req.query;

        let sql = `
            SELECT 
                m.request_id,
                m.title,
                m.description,
                m.request_date,
                m.status,
                m.resolved_date,
                m.resolution_note,
                r.room_id,
                r.room_number,
                h.house_name
            FROM maintenance_requests m
            JOIN rooms r ON m.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE m.tenant_id = ?
        `;

        const params = [tenantId];

        if (room_id) {
            sql += ` AND m.room_id = ?`;
            params.push(room_id);
        }

        if (status && status !== 'all') {
            sql += ` AND m.status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY m.request_date DESC LIMIT ?`;
        params.push(parseInt(limit));

        const [rows] = await pool.query(sql, params);

        res.json(rows);
    } catch (err) {
        console.error('Get Maintenance Requests Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy yêu cầu bảo trì', error: err.message });
    }
};

// Thanh toán tiếp theo
const getNextPayment = async (req, res) => {
    try {
        const tenantId = getTenantIdFromToken(req);
        if (!tenantId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { room_id } = req.query; // Optional: filter by room

        let sql = `
            SELECT 
                i.invoice_id,
                i.billing_period,
                i.issue_date,
                i.due_date,
                i.total_amount,
                i.room_rent,
                i.status,
                r.room_id,
                r.room_number,
                h.house_name,
                DATEDIFF(i.due_date, CURRENT_DATE()) AS days_until_due
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE c.tenant_id = ?
                AND i.status = 'Unpaid'
        `;

        const params = [tenantId];

        if (room_id) {
            sql += ` AND c.room_id = ?`;
            params.push(room_id);
        }

        sql += ` ORDER BY i.due_date ASC LIMIT 1`;

        const [rows] = await pool.query(sql, params);

        if (rows.length === 0) {
            return res.json(null);
        }

        const payment = rows[0];
        const daysUntilDue = payment.days_until_due;
        
        // Xác định trạng thái
        let paymentStatus = 'on_time';
        if (daysUntilDue < 0) {
            paymentStatus = 'overdue';
        } else if (daysUntilDue <= 3) {
            paymentStatus = 'due_soon';
        }

        res.json({
            ...payment,
            payment_status: paymentStatus,
            days_until_due: daysUntilDue
        });
    } catch (err) {
        console.error('Get Next Payment Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy thanh toán tiếp theo', error: err.message });
    }
};

module.exports = {
    getOverview,
    getRooms,
    getMonthlyExpenses,
    getUtilityUsage,
    getRecentPayments,
    getMaintenanceRequests,
    getNextPayment
};

