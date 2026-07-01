// routes/admin.js - Admin management routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const adminAuth = require('../middleware/adminAuth');
const bcrypt = require('bcryptjs');
const discordLogger = require('../utils/discord');

// Apply admin auth to all routes below
router.use(adminAuth);

// ============================================================
// USERS MANAGEMENT
// ============================================================

// GET /api/admin/users - Lấy danh sách tất cả người dùng
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, balance, role, created_at
             FROM users
             ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PATCH /api/admin/users/:id/balance - Sửa số dư ví của người dùng
router.patch('/users/:id/balance', async (req, res) => {
    const { id } = req.params;
    const { balance } = req.body;

    if (balance === undefined || isNaN(Number(balance)) || Number(balance) < 0) {
        return res.status(400).json({ error: 'Số dư không hợp lệ (phải là số không âm)' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const oldUserRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [id]);
            if (oldUserRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            }
            
            const oldBalance = oldUserRes.rows[0].balance;
            const newBalance = Math.floor(Number(balance));
            const diff = newBalance - oldBalance;

            const result = await client.query(
                `UPDATE users SET balance = $1 WHERE id = $2 RETURNING id, name, email, balance`,
                [newBalance, id]
            );

            if (diff !== 0) {
                await client.query(
                    `INSERT INTO transactions (user_id, type, amount, status, keyword)
                     VALUES ($1, $2, $3, 'completed', 'Admin Update')`,
                    [id, diff > 0 ? 'deposit' : 'payment', Math.abs(diff)]
                );
                
                discordLogger.sendTopupLog(req.user.name, result.rows[0].name, result.rows[0].email, diff, newBalance);
            }

            await client.query('COMMIT');
            res.json({ success: true, user: result.rows[0] });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Update balance error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PATCH /api/admin/users/:id/role - Thay đổi quyền của người dùng
router.patch('/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Quyền không hợp lệ' });
    }

    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Không thể tự thay đổi quyền của chính mình' });
    }

    try {
        const result = await pool.query(
            `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role`,
            [role, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PATCH /api/admin/users/:id/reset-password - Đặt lại mật khẩu về mặc định
router.patch('/users/:id/reset-password', async (req, res) => {
    const { id } = req.params;

    try {
        const newPasswordHash = await bcrypt.hash('123456', 10);
        const result = await pool.query(
            `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, name, email`,
            [newPasswordHash, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        res.json({ success: true, message: 'Đã đặt lại mật khẩu thành 123456' });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/admin/users/:id - Xóa tài khoản người dùng
router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;

    // Không cho xóa chính mình
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản của chính mình' });
    }

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ============================================================
// PRODUCTS MANAGEMENT
// ============================================================

// POST /api/admin/products - Thêm sản phẩm mới
router.post('/products', async (req, res) => {
    const { title, description, category, price, old_price, badge, image, image_url, video_url, features } = req.body;
    
    if (!title || !description || !category || price === undefined) {
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO products (title, description, category, price, old_price, badge, image, image_url, video_url, features)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [title, description, category, parseInt(price), old_price ? parseInt(old_price) : null, badge || null, image || null, image_url || null, video_url || null, JSON.stringify(features || [])]
        );
        res.json({ success: true, product: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PUT /api/admin/products/:id - Sửa sản phẩm
router.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, category, price, old_price, badge, image, image_url, video_url, features } = req.body;

    if (!title || !description || !category || price === undefined) {
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc' });
    }

    try {
        const result = await pool.query(
            `UPDATE products 
             SET title = $1, description = $2, category = $3, price = $4, old_price = $5, badge = $6, image = $7, image_url = $8, video_url = $9, features = $10
             WHERE id = $11
             RETURNING *`,
            [title, description, category, parseInt(price), old_price ? parseInt(old_price) : null, badge || null, image || null, image_url || null, video_url || null, JSON.stringify(features || []), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json({ success: true, product: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/admin/products/:id - Xóa sản phẩm
router.delete('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ============================================================
// ORDERS MANAGEMENT
// ============================================================

// GET /api/admin/orders - Lấy danh sách tất cả đơn hàng
router.get('/orders', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.id, o.total_amount, o.status, o.created_at,
                    u.name as user_name, u.email as user_email,
                    COUNT(oi.id) as item_count
             FROM orders o
             INNER JOIN users u ON u.id = o.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             GROUP BY o.id, u.name, u.email
             ORDER BY o.created_at DESC`
        );
        res.json({ orders: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/admin/orders/:id - Xóa đơn hàng
router.delete('/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // order_items sẽ tự xóa theo nhờ ON DELETE CASCADE
        const result = await pool.query(
            'DELETE FROM orders WHERE id = $1 RETURNING id',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ============================================================
// STATS
// ============================================================

// GET /api/admin/stats - Thống kê tổng quan
router.get('/stats', async (req, res) => {
    try {
        const [usersCount, ordersCount, revenue, productsCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users WHERE role != $1', ['admin']),
            pool.query('SELECT COUNT(*) FROM orders WHERE status = $1', ['completed']),
            pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'completed'"),
            pool.query('SELECT COUNT(*) FROM products')
        ]);

        res.json({
            users: parseInt(usersCount.rows[0].count),
            orders: parseInt(ordersCount.rows[0].count),
            revenue: parseInt(revenue.rows[0].total),
            products: parseInt(productsCount.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
