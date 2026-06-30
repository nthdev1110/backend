// middleware/adminAuth.js - Admin-only middleware
const jwt = require('jsonwebtoken');
const pool = require('../db');

const adminAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Vui lòng đăng nhập' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await pool.query(
            'SELECT id, name, email, balance, role FROM users WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Tài khoản không tồn tại' });
        }

        if (result.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Bạn không có quyền truy cập trang này' });
        }

        req.user = result.rows[0];
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token không hợp lệ' });
    }
};

module.exports = adminAuth;
