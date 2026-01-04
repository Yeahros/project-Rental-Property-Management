const pool = require('../config/database');

// Lấy thống kê
const getStats = async (req, res) => {
    try {
        const [rooms] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'Vacant' THEN 1 ELSE 0 END) as vacant
            FROM rooms
        `);

        const [revenue] = await pool.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total_revenue
            FROM invoices 
            WHERE status = 'Paid' 
            AND MONTH(issue_date) = MONTH(CURRENT_DATE()) 
            AND YEAR(issue_date) = YEAR(CURRENT_DATE())
        `);

        res.json({
            total_rooms: rooms[0].total,
            occupied: rooms[0].occupied,
            vacant: rooms[0].vacant,
            revenue: revenue[0].total_revenue
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi Server khi lấy thống kê');
    }
};

// Lấy danh sách Nhà trọ
const getHouses = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM boarding_houses');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
};

// Lấy doanh thu tháng của một nhà trọ
const getHouseRevenue = async (req, res) => {
    try {
        const houseId = req.params.id;

        const [revenue] = await pool.query(`
            SELECT COALESCE(SUM(base_rent), 0) as monthly_revenue
            FROM rooms
            WHERE house_id = ?
        `, [houseId]);

        res.json({ monthly_revenue: revenue[0].monthly_revenue || 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi khi lấy doanh thu', error: err.message });
    }
};

// Tạo Nhà trọ mới
const createHouse = async (req, res) => {
    const { name, address, description, landlord_id } = req.body;
    const ownerId = landlord_id || 1;

    try {
        const sql = 'INSERT INTO boarding_houses (landlord_id, house_name, address, description, total_rooms) VALUES (?, ?, ?, ?, 0)';
        const [result] = await pool.execute(sql, [ownerId, name, address, description]);
        res.json({ message: 'Tạo nhà thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo nhà');
    }
};

module.exports = {
    getStats,
    getHouses,
    getHouseRevenue,
    createHouse
};

