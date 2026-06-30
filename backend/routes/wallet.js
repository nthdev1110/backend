// routes/wallet.js - Wallet & Deposit Routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/wallet/balance - Lấy số dư ví của tài khoản
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
        const balance = result.rows[0].balance;
        const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(balance);
        res.json({ balance, formatted });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// POST /api/wallet/pay - Thanh toán bằng ví điện tử
router.post('/pay', authMiddleware, async (req, res) => {
    const { amount, orderData } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Số tiền thanh toán không hợp lệ' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lấy và khóa dòng user để đảm bảo an toàn đồng thời
        const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        const currentBalance = userRes.rows[0].balance;

        if (currentBalance < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Số dư ví tiền ảo không đủ. Vui lòng nạp thêm!' });
        }

        // Trừ tiền
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.user.id]);

        // Lưu lịch sử giao dịch
        await client.query(
            `INSERT INTO transactions (user_id, type, amount, status)
             VALUES ($1, 'payment', $2, 'completed')`,
            [req.user.id, amount]
        );

        // Lưu bản ghi mua hàng cho các script
        if (orderData && orderData.cart) {
            // Tạo hóa đơn mới
            const orderRes = await client.query(
                `INSERT INTO orders (user_id, total_amount, status, payment_method)
                 VALUES ($1, $2, 'completed', 'wallet')
                 RETURNING id`,
                [req.user.id, amount]
            );
            const orderId = orderRes.rows[0].id;

            // Sinh key cho từng script
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            for (const item of orderData.cart) {
                const licenseKey = `GTA5-LIC-${Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}-${Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`;
                
                // Lấy giá sản phẩm
                const prodRes = await client.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
                const price = prodRes.rows.length > 0 ? prodRes.rows[0].price : 0;

                await client.query(
                    `INSERT INTO order_items (order_id, product_id, license_key, price)
                     VALUES ($1, $2, $3, $4)`,
                    [orderId, item.product_id, licenseKey, price]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Wallet payment error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    } finally {
        client.release();
    }
});



// GET /api/wallet/transactions - Lấy lịch sử giao dịch
router.get('/transactions', authMiddleware, async (req, res) => {
    const { limit = 10 } = req.query;

    try {
        const result = await pool.query(
            `SELECT * FROM transactions
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.user.id, parseInt(limit)]
        );

        const transactions = result.rows.map(row => ({
            id: `TX${100000 + row.id}`,
            type: row.type,
            amount: row.amount,
            amount_formatted: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.amount),
            status: row.status,
            keyword: row.keyword,
            created_at: row.created_at
        }));

        res.json({ transactions });
    } catch (err) {
        console.error('Get transactions error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
