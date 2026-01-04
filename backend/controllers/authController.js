const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Đăng ký Chủ trọ
const registerLandlord = async (req, res) => {
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
};

// Đăng nhập Chủ trọ
const loginLandlord = async (req, res) => {
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
};

// Đăng nhập Khách thuê
const loginTenant = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM tenants WHERE phone = ?', [email]);
        if (rows.length === 0) return res.status(401).json({ message: 'SĐT khách thuê không tồn tại' });

        const tenant = rows[0];

        if (tenant.is_active === 0) {
            return res.status(403).json({ message: 'Tài khoản đã bị khóa do không còn hợp đồng thuê hoạt động.' });
        }

        if (!tenant.plain_password) {
            return res.status(400).json({ message: 'Tài khoản chưa có mật khẩu.' });
        }

        if (password !== tenant.plain_password) {
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
};

module.exports = {
    registerLandlord,
    loginLandlord,
    loginTenant
};

