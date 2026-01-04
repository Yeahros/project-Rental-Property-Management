const pool = require('../config/database');

// Lấy 4 chỉ số thống kê
const getDashboardStats = async (req, res) => {
    try {
        const [houses] = await pool.query('SELECT COUNT(*) as total FROM boarding_houses');

        const [rooms] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied
            FROM rooms
        `);

        const [revenue] = await pool.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM invoices 
            WHERE status = 'Paid' 
            AND MONTH(paid_date) = MONTH(CURRENT_DATE()) 
            AND YEAR(paid_date) = YEAR(CURRENT_DATE())
        `);

        const [maintenance] = await pool.query(`
            SELECT 
                SUM(CASE WHEN status IN ('New', 'InProgress') THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'InProgress' THEN 1 ELSE 0 END) as processing
            FROM maintenance_requests
        `);

        res.json({
            total_houses: houses[0].total,
            occupancy_rate: rooms[0].total > 0 ? Math.round((rooms[0].occupied / rooms[0].total) * 100) : 0,
            occupied_count: rooms[0].occupied,
            total_rooms: rooms[0].total,
            revenue_month: revenue[0].total,
            maintenance_active: maintenance[0].active || 0,
            maintenance_processing: maintenance[0].processing || 0
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// Biểu đồ doanh thu 6 tháng gần nhất
const getDashboardChart = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                DATE_FORMAT(paid_date, '%m/%Y') as month_year,
                SUM(total_amount) as total
            FROM invoices 
            WHERE status = 'Paid' 
            AND paid_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month_year
            ORDER BY paid_date ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// Khoản thanh toán sắp tới
const getUpcomingPayments = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT i.total_amount, i.due_date, r.room_number, t.full_name
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN tenants t ON c.tenant_id = t.tenant_id
            WHERE i.status = 'Unpaid'
            ORDER BY i.due_date ASC
            LIMIT 5
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// Hoạt động gần đây
const getDashboardActivities = async (req, res) => {
    try {
        const [payments] = await pool.query(`
            SELECT 'payment' as type, i.paid_date as created_at, i.total_amount as val, t.full_name, r.room_number
            FROM invoices i 
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN tenants t ON c.tenant_id = t.tenant_id
            WHERE i.status = 'Paid' ORDER BY i.paid_date DESC LIMIT 3
        `);

        const [maintenance] = await pool.query(`
            SELECT 'maintenance' as type, m.request_date as created_at, m.title as val, t.full_name, r.room_number
            FROM maintenance_requests m
            JOIN rooms r ON m.room_id = r.room_id
            JOIN tenants t ON m.tenant_id = t.tenant_id
            ORDER BY m.request_date DESC LIMIT 3
        `);

        const [newTenants] = await pool.query(`
            SELECT 'tenant' as type, c.created_at, '' as val, t.full_name, r.room_number
            FROM contracts c
            JOIN rooms r ON c.room_id = r.room_id
            JOIN tenants t ON c.tenant_id = t.tenant_id
            ORDER BY c.created_at DESC LIMIT 3
        `);

        const activities = [...payments, ...maintenance, ...newTenants]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);

        res.json(activities);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// Bất động sản hàng đầu
const getTopProperties = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT h.house_name, h.total_rooms,
                (SELECT COUNT(*) FROM rooms r WHERE r.house_id = h.house_id AND r.status = 'Occupied') as occupied_rooms,
                (SELECT COALESCE(SUM(r.base_rent), 0) FROM rooms r WHERE r.house_id = h.house_id AND r.status = 'Occupied') as estimated_revenue
            FROM boarding_houses h
            LIMIT 3
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

module.exports = {
    getDashboardStats,
    getDashboardChart,
    getUpcomingPayments,
    getDashboardActivities,
    getTopProperties
};

