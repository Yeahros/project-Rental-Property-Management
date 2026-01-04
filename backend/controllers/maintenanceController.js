const pool = require('../config/database');

// Lấy Thống kê Bảo trì
const getMaintenanceStats = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_requests,
                SUM(CASE WHEN status = 'InProgress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM maintenance_requests
        `);
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi thống kê bảo trì');
    }
};

// Lấy Danh sách Yêu cầu Bảo trì
const getMaintenanceRequests = async (req, res) => {
    const { status, search } = req.query;

    let sql = `
        SELECT m.*, 
               r.room_number, 
               h.house_name,
               t.full_name as tenant_name
        FROM maintenance_requests m
        JOIN rooms r ON m.room_id = r.room_id
        JOIN boarding_houses h ON r.house_id = h.house_id
        JOIN tenants t ON m.tenant_id = t.tenant_id
        WHERE 1=1
    `;

    const params = [];

    if (status && status !== 'All') {
        sql += ` AND m.status = ?`;
        params.push(status);
    }

    if (search) {
        sql += ` AND (t.full_name LIKE ? OR r.room_number LIKE ? OR m.title LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY FIELD(m.status, 'New', 'InProgress', 'Completed', 'Cancelled'), m.request_date DESC`;

    try {
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err);
    }
};

// Cập nhật Trạng thái Bảo trì
const updateMaintenanceStatus = async (req, res) => {
    const { status, note } = req.body;
    const requestId = req.params.id;

    try {
        let sql = `UPDATE maintenance_requests SET status = ?`;
        let params = [status];

        if (status === 'Completed' || status === 'Cancelled') {
            sql += `, resolved_date = CURRENT_TIMESTAMP, resolution_note = ?`;
            params.push(note || '');
        }

        sql += ` WHERE request_id = ?`;
        params.push(requestId);

        await pool.query(sql, params);
        res.json({ message: 'Cập nhật trạng thái thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi cập nhật');
    }
};

// Tạo Yêu cầu Bảo trì Mới
const createMaintenanceRequest = async (req, res) => {
    const { room_id, title, description } = req.body;
    try {
        const [contracts] = await pool.query(`
            SELECT tenant_id FROM contracts 
            WHERE room_id = ? AND status = 'Active' LIMIT 1
        `, [room_id]);

        if (contracts.length === 0) return res.status(400).json({ message: 'Phòng này hiện không có người thuê' });

        const tenantId = contracts[0].tenant_id;

        await pool.query(`
            INSERT INTO maintenance_requests (room_id, tenant_id, title, description, status)
            VALUES (?, ?, ?, ?, 'New')
        `, [room_id, tenantId, title, description]);

        res.json({ message: 'Tạo yêu cầu thành công' });
    } catch (err) {
        res.status(500).send(err);
    }
};

module.exports = {
    getMaintenanceStats,
    getMaintenanceRequests,
    updateMaintenanceStatus,
    createMaintenanceRequest
};

