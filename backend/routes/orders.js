// routes/orders.js - Orders Routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// Helper: Sinh License Key ngẫu nhiên cho FiveM
function generateFiveMLicense() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment1 = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const segment2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `GTA5-LIC-${segment1}-${segment2}`;
}

// POST /api/orders/create - Tạo đơn hàng và trừ tiền ví, sinh key bản quyền
router.post('/create', authMiddleware, async (req, res) => {
    const { paymentMethod = 'online' } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lấy thông tin giỏ hàng hiện tại của user
        const cartResult = await client.query(
            `SELECT ci.quantity, p.id as product_id, p.price, p.title
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             WHERE ci.user_id = $1`,
            [req.user.id]
        );

        const cartItems = cartResult.rows;
        if (cartItems.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Giỏ hàng trống!' });
        }

        // 2. Tính tổng tiền
        let totalAmount = 0;
        cartItems.forEach(item => {
            totalAmount += item.price * item.quantity;
        });

        // 3. Nếu thanh toán bằng ví điện tử (wallet)
        if (paymentMethod === 'online' || paymentMethod === 'wallet') {
            // Lấy lại balance mới nhất của user để kiểm tra
            const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
            const currentBalance = userRes.rows[0].balance;

            if (currentBalance < totalAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Số dư ví tiền ảo không đủ. Vui lòng nạp thêm!' });
            }

            // Trừ số dư ví
            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [totalAmount, req.user.id]);

            // Ghi nhận giao dịch ví
            await client.query(
                `INSERT INTO transactions (user_id, type, amount, status)
                 VALUES ($1, 'payment', $2, 'completed')`,
                [req.user.id, totalAmount]
            );
        }

        // 4. Tạo hóa đơn mới
        const orderRes = await client.query(
            `INSERT INTO orders (user_id, total_amount, status, payment_method)
             VALUES ($1, $2, 'completed', $3)
             RETURNING id, status, payment_method`,
            [req.user.id, totalAmount, paymentMethod]
        );
        const orderId = orderRes.rows[0].id;

        // 5. Chuyển giỏ hàng thành chi tiết đơn và sinh key bản quyền
        const purchases = [];
        for (const item of cartItems) {
            const licenseKey = generateFiveMLicense();
            const downloadUrl = `https://gta5code.com/downloads/scripts/${item.product_id}/source.zip`;

            await client.query(
                `INSERT INTO order_items (order_id, product_id, license_key, price)
                 VALUES ($1, $2, $3, $4)`,
                [orderId, item.product_id, licenseKey, item.price]
            );

            purchases.push({
                id: `ORD${100000 + orderId}`,
                product: {
                    id: item.product_id,
                    title: item.title
                },
                license_key: licenseKey,
                download_url: downloadUrl,
                purchased_at: new Date().toISOString()
            });
        }

        // 6. Xóa giỏ hàng
        await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

        await client.query('COMMIT');
        res.json({
            success: true,
            order: {
                id: `ORD${100000 + orderId}`,
                status: 'completed',
                payment: 'completed'
            },
            purchases // Trả về kèm purchases để frontend có thể đồng bộ nhanh nếu cần
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Create order error:', err);
        res.status(500).json({ error: 'Lỗi server khi thanh toán, giao dịch đã được hủy!' });
    } finally {
        client.release();
    }
});

// GET /api/orders - Lấy lịch sử mua hàng của user (danh sách purchased)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT oi.license_key, oi.price, o.created_at as purchased_at, p.*, o.id as order_id
             FROM order_items oi
             INNER JOIN orders o ON o.id = oi.order_id
             INNER JOIN products p ON p.id = oi.product_id
             WHERE o.user_id = $1 AND o.status = 'completed'
             ORDER BY o.created_at DESC`,
            [req.user.id]
        );

        const purchases = result.rows.map(row => ({
            id: `ORD${100000 + row.order_id}`,
            user_id: req.user.id,
            license_key: row.license_key,
            download_url: `https://gta5code.com/downloads/scripts/${row.id}/source.zip`,
            purchased_at: row.purchased_at,
            product: {
                id: row.id,
                title: row.title,
                description: row.description,
                category: row.category,
                price: row.price,
                old_price: row.old_price,
                badge: row.badge,
                image: row.image,
                image_url: row.image_url,
                video_url: row.video_url,
                features: row.features
            }
        }));

        res.json({ purchases });
    } catch (err) {
        console.error('Get orders error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// GET /api/orders/:id - Chi tiết một đơn hàng cụ thể
router.get('/:id', authMiddleware, async (req, res) => {
    const rawId = req.params.id.replace('ORD', '');
    const orderId = parseInt(rawId);

    if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Đơn hàng không hợp lệ' });
    }

    try {
        const orderResult = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
            [orderId, req.user.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
        }

        const itemsResult = await pool.query(
            `SELECT oi.*, p.title
             FROM order_items oi
             INNER JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = $1`,
            [orderId]
        );

        res.json({
            order: orderResult.rows[0],
            items: itemsResult.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
