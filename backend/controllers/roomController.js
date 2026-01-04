const pool = require('../config/database');

// Lấy danh sách Phòng
const getRooms = async (req, res) => {
    const houseId = req.query.house_id;
    let sql = `
        SELECT r.*, 
               t.full_name as tenant_name, 
               c.end_date as contract_end_date 
        FROM rooms r
        LEFT JOIN contracts c ON r.room_id = c.room_id AND c.is_current = 1
        LEFT JOIN tenants t ON c.tenant_id = t.tenant_id
    `;

    let params = [];
    if (houseId) {
        sql += ` WHERE r.house_id = ?`;
        params.push(houseId);
    }

    try {
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
};

// Tạo Phòng mới
const createRoom = async (req, res) => {
    const { house_id, room_number, floor, area, rent, facilities } = req.body;

    if (!house_id) return res.status(400).json({ message: "Cần chọn nhà trọ" });

    try {
        const sql = `INSERT INTO rooms (house_id, room_number, floor, area_m2, base_rent, facilities, status) 
                     VALUES (?, ?, ?, ?, ?, ?, 'Vacant')`;

        const [result] = await pool.execute(sql, [house_id, room_number, floor, area, rent, facilities]);

        await pool.execute(`UPDATE boarding_houses SET total_rooms = total_rooms + 1 WHERE house_id = ?`, [house_id]);

        res.json({ message: 'Tạo phòng thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo phòng: ' + err.message);
    }
};

module.exports = {
    getRooms,
    createRoom
};

