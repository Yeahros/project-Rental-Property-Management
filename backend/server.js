require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors()); // Cho phép frontend gọi API
app.use(bodyParser.json());

// Kết nối Database
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// PHẦN 1: API XÁC THỰC (AUTH)
// ==========================================

// 1. Đăng ký Chủ trọ
app.post('/api/register/landlord', async (req, res) => {
    const { full_name, phone, email, password, address } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM landlords WHERE phone = ?', [phone]);
        if (rows.length > 0) {
            return res.status(400).json({ message: 'Số điện thoại đã được đăng ký' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const [result] = await pool.execute(
            'INSERT INTO landlords (full_name, phone, email, password_hash, address) VALUES (?, ?, ?, ?, ?)',
            [full_name, phone, email, password_hash, address || null]
        );

        res.status(201).json({ message: 'Đăng ký thành công', landlordId: result.insertId });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// 2. Đăng nhập Chủ trọ
app.post('/api/login/landlord', async (req, res) => {
    const { email, password } = req.body; 

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM landlords WHERE email = ? OR phone = ?', 
            [email, email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Tài khoản không tồn tại' });
        }

        const landlord = rows[0];
        const isMatch = await bcrypt.compare(password, landlord.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Sai mật khẩu' });
        }

        const token = jwt.sign(
            { id: landlord.landlord_id, role: 'landlord' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            message: 'Đăng nhập thành công',
            token,
            user: { name: landlord.full_name, role: 'landlord' }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// 3. Đăng nhập Khách thuê
app.post('/api/login/tenant', async (req, res) => {
    const { email, password } = req.body; 

    try {
        const [rows] = await pool.execute('SELECT * FROM tenants WHERE phone = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Số điện thoại khách thuê không tồn tại' });
        }

        const tenant = rows[0];

        if (!tenant.password_hash) {
             return res.status(400).json({ message: 'Tài khoản này chưa được thiết lập mật khẩu. Vui lòng liên hệ chủ trọ.' });
        }

        const isMatch = await bcrypt.compare(password, tenant.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Sai mật khẩu' });
        }

        const token = jwt.sign(
            { id: tenant.tenant_id, role: 'tenant' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            message: 'Đăng nhập thành công',
            token,
            user: { name: tenant.full_name, role: 'tenant' }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// ==========================================
// PHẦN 2: API QUẢN LÝ BẤT ĐỘNG SẢN (MỚI THÊM)
// ==========================================

// 4. Lấy thống kê (Stats)
app.get('/api/stats', async (req, res) => {
    try {
        // Query đếm số phòng và trạng thái
        const [rooms] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'Vacant' THEN 1 ELSE 0 END) as vacant
            FROM rooms
        `);

        // Query tính doanh thu tháng hiện tại (từ các hóa đơn đã thanh toán)
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
});

// 5. Lấy danh sách Nhà trọ
app.get('/api/houses', async (req, res) => {
    try {
        // Thực tế sau này sẽ cần WHERE landlord_id = ? lấy từ Token
        const [rows] = await pool.query('SELECT * FROM boarding_houses');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
});

// 6. Tạo Nhà trọ mới
app.post('/api/houses', async (req, res) => {
    const { name, address, description, landlord_id } = req.body;
    // Tạm thời lấy landlord_id từ body gửi lên (demo), sau này lấy từ Token
    const ownerId = landlord_id || 1; 

    try {
        const sql = 'INSERT INTO boarding_houses (landlord_id, house_name, address, description, total_rooms) VALUES (?, ?, ?, ?, 0)';
        const [result] = await pool.execute(sql, [ownerId, name, address, description]);
        res.json({ message: 'Tạo nhà thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo nhà');
    }
});

// 7. Lấy danh sách Phòng (kèm thông tin người thuê nếu có)
app.get('/api/rooms', async (req, res) => {
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
});

// 8. Tạo Phòng mới
app.post('/api/rooms', async (req, res) => {
    const { house_id, room_number, floor, area, rent, facilities } = req.body;

    if (!house_id) return res.status(400).json({message: "Cần chọn nhà trọ"});

    try {
        const sql = `INSERT INTO rooms (house_id, room_number, floor, area_m2, base_rent, facilities, status) 
                     VALUES (?, ?, ?, ?, ?, ?, 'Vacant')`;
        
        const [result] = await pool.execute(sql, [house_id, room_number, floor, area, rent, facilities]);
        
        // Cập nhật số lượng phòng cho nhà
        await pool.execute(`UPDATE boarding_houses SET total_rooms = total_rooms + 1 WHERE house_id = ?`, [house_id]);

        res.json({ message: 'Tạo phòng thành công', id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi khi tạo phòng: ' + err.message);
    }
});

// Khởi chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});