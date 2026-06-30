// server.js - Backend Application Entry Point
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: '*', // Cho phép tất cả các nguồn gọi API (rất tốt khi chạy frontend trên InfinityFree)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Import Routes
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const ordersRouter = require('./routes/orders');
const walletRouter = require('./routes/wallet');
const runMigration = require('./migrate');

// Test Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'MỘC LANE API Server is running!' });
});

// Dynamic Migration Route - Dễ dàng gọi qua trình duyệt để setup database!
app.get('/api/migrate', async (req, res) => {
    try {
        const result = await runMigration();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Migration failed', details: err.message });
    }
});

const adminRouter = require('./routes/admin');

// Mount Routes
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/admin', adminRouter);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Lỗi server hệ thống!' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 API Server is running on port ${PORT}`);
    console.log(`👉 Test API health: http://localhost:${PORT}/api/health`);
    console.log(`👉 Run DB migration: http://localhost:${PORT}/api/migrate`);
});
