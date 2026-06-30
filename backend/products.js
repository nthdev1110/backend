// routes/products.js - Products Routes
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

// GET /api/products - Lấy danh sách sản phẩm (có filter + search)
router.get('/', async (req, res) => {
    const { category, search, limit = 50, offset = 0 } = req.query;

    try {
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let idx = 1;

        if (category && category !== 'all') {
            query += ` AND category = $${idx++}`;
            params.push(category);
        }
        if (search) {
            query += ` AND (LOWER(title) LIKE $${idx} OR LOWER(description) LIKE $${idx})`;
            params.push(`%${search.toLowerCase()}%`);
            idx++;
        }

        query += ` ORDER BY id ASC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);
        res.json({ products: result.rows });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// GET /api/products/meta/categories - Lấy danh sách danh mục
router.get('/meta/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
        const categories = result.rows.map(r => r.category);
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// GET /api/products/user/wishlist - Lấy danh sách yêu thích
router.get('/user/wishlist', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.* FROM products p
             INNER JOIN wishlists w ON w.product_id = p.id
             WHERE w.user_id = $1`,
            [req.user.id]
        );
        res.json({ products: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// GET /api/products/:id - Chi tiết sản phẩm
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// POST /api/products/:id/wishlist - Thêm vào yêu thích
router.post('/:id/wishlist', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.user.id, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/products/:id/wishlist - Xóa khỏi yêu thích
router.delete('/:id/wishlist', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2',
            [req.user.id, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
