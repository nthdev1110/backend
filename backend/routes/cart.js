// routes/cart.js - Shopping Cart Routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/cart
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ci.id as cart_id, ci.quantity, p.*
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             WHERE ci.user_id = $1`,
            [req.user.id]
        );

        const items = result.rows.map(row => ({
            cart_id: row.cart_id,
            quantity: row.quantity,
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

        res.json({ cart: { items } });
    } catch (err) {
        console.error('Get cart error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// POST /api/cart/add
router.post('/add', authMiddleware, async (req, res) => {
    const { productId, quantity = 1 } = req.body;

    try {
        // Check product exists
        const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
        }

        // Upsert: if already in cart, increase quantity
        await pool.query(
            `INSERT INTO cart_items (user_id, product_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, product_id)
             DO UPDATE SET quantity = cart_items.quantity + $3`,
            [req.user.id, productId, quantity]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Add to cart error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PUT /api/cart/item/:id - Cập nhật số lượng
router.put('/item/:id', authMiddleware, async (req, res) => {
    const { quantity } = req.body;

    try {
        if (quantity <= 0) {
            await pool.query(
                'DELETE FROM cart_items WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
        } else {
            await pool.query(
                'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3',
                [quantity, req.params.id, req.user.id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/cart/item/:id - Xóa item theo cart ID
router.delete('/item/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM cart_items WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/cart/product/:id - Xóa item theo product ID
router.delete('/product/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM cart_items WHERE product_id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/cart/clear - Xóa toàn bộ giỏ hàng
router.delete('/clear', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// POST /api/cart/sync - Đồng bộ giỏ hàng từ client (sau khi đăng nhập)
router.post('/sync', authMiddleware, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.json({ success: true });
    }

    try {
        for (const item of items) {
            const product = await pool.query('SELECT id FROM products WHERE id = $1', [item.id]);
            if (product.rows.length === 0) continue;

            await pool.query(
                `INSERT INTO cart_items (user_id, product_id, quantity)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, product_id)
                 DO UPDATE SET quantity = GREATEST(cart_items.quantity, $3)`,
                [req.user.id, item.id, item.quantity || 1]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Sync cart error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// POST /api/cart/verify-total - Xác minh tổng tiền phía server
router.post('/verify-total', authMiddleware, async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    try {
        let serverTotal = 0;
        let valid = true;

        for (const item of items) {
            const result = await pool.query('SELECT price FROM products WHERE id = $1', [item.id]);
            if (result.rows.length === 0) { valid = false; continue; }
            serverTotal += result.rows[0].price * (item.quantity || 1);
        }

        res.json({ valid, serverTotal });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
