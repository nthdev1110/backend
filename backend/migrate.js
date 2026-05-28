// migrate.js - Database Schema and Seed Scripts
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function runMigration() {
    console.log('🔄 Starting database migration...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Tạo bảng users
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                balance INTEGER DEFAULT 0,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✔ Table "users" verified/created');

        // 2. Tạo bảng products
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                category VARCHAR(50) NOT NULL,
                price INTEGER NOT NULL,
                old_price INTEGER,
                badge VARCHAR(20),
                image VARCHAR(100),
                image_url TEXT,
                video_url TEXT,
                features JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✔ Table "products" verified/created');

        // 3. Tạo bảng cart_items
        await client.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id)
            )
        `);
        console.log('✔ Table "cart_items" verified/created');

        // 4. Tạo bảng orders
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                total_amount INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                payment_method VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✔ Table "orders" verified/created');

        // 5. Tạo bảng order_items
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                license_key VARCHAR(100) UNIQUE NOT NULL,
                price INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✔ Table "order_items" verified/created');

        // 6. Tạo bảng transactions
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(20) NOT NULL, -- deposit / payment
                amount INTEGER NOT NULL,
                keyword VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pending', -- pending / completed
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✔ Table "transactions" verified/created');

        // 7. Tạo bảng wishlists
        await client.query(`
            CREATE TABLE IF NOT EXISTS wishlists (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, product_id)
            )
        `);
        console.log('✔ Table "wishlists" verified/created');

        // 8. Seeding initial products data
        const prodCount = await client.query('SELECT COUNT(*) FROM products');
        if (parseInt(prodCount.rows[0].count) === 0) {
            console.log('🌱 Seeding initial products...');
            
            const MOCK_PRODUCTS = [
                {
                    title: "QB-Core Advanced Job System",
                    description: "Hệ thống nghề nghiệp nâng cao toàn diện cho server FiveM QB-Core. Tích hợp giao diện đẹp mắt, tối ưu hiệu suất cực cao, cấu hình dễ dàng qua UI.",
                    category: "jobs",
                    price: 350000,
                    old_price: 500000,
                    badge: "HOT",
                    image: "fas fa-briefcase",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Tối ưu hóa cực cao (Resmon 0.01ms)",
                        "Giao diện quản lý nghề nghiệp tuyệt đẹp",
                        "Hỗ trợ QB-Core & ESX mới nhất",
                        "Tích hợp Discord Log ghi nhận chi tiết"
                    ])
                },
                {
                    title: "Realistic Car Dealer Showroom",
                    description: "Giao diện cửa hàng bán xe 3D siêu hiện đại. Xem thông số xe trực quan, hỗ trợ lái thử, thanh toán trả góp linh hoạt và camera xoay 360 độ cực mượt.",
                    category: "vehicles",
                    price: 450000,
                    old_price: 600000,
                    badge: "NEW",
                    image: "fas fa-car",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Camera xoay 360 độ quanh xe mượt mà",
                        "Hệ thống mua xe trả góp theo thời gian thực",
                        "Dễ dàng thêm xe và phân loại hãng xe",
                        "Discord Webhook ghi lại giao dịch mua xe"
                    ])
                },
                {
                    title: "Cyberpunk HUD & Speedometer",
                    description: "Bộ HUD hiển thị trạng thái nhân vật và đồng hồ tốc độ xe lấy cảm hứng từ Cyberpunk 2077. Thiết kế vector sắc nét, hỗ trợ chỉnh màu RGB theo sở thích.",
                    category: "ui",
                    price: 250000,
                    old_price: 350000,
                    badge: "SALE",
                    image: "fas fa-tachometer-alt",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Giao diện responsive tương thích mọi độ phân giải",
                        "Chế độ chỉnh màu RGB tùy biến trực tiếp",
                        "Hiển thị chi tiết xăng, dây đai an toàn, độ hỏng xe",
                        "Tối ưu hoàn hảo, cam kết không sụt giảm FPS"
                    ])
                },
                {
                    title: "Ultimate Grid Inventory System",
                    description: "Hệ thống túi đồ (Inventory) dạng ô lưới kéo thả chuyên nghiệp nhất FiveM. Tích hợp tính năng chế tác (Crafting), độ bền vật phẩm và hiển thị metadata.",
                    category: "ui",
                    price: 600000,
                    old_price: 800000,
                    badge: "BEST",
                    image: "fas fa-boxes",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Kéo thả vật phẩm siêu mượt mà",
                        "Hệ thống chế tạo đồ (Crafting) đa dạng công thức",
                        "Hỗ trợ độ bền vật phẩm và gắn phụ kiện súng",
                        "Lưu trữ dữ liệu MySQL an toàn, chống bug đồ"
                    ])
                },
                {
                    title: "Advanced Miner & Smelter Job",
                    description: "Nghề khai thác khoáng sản và luyện quặng với mức độ tương tác cao. Đi kèm các minigame đập đá, nung quặng, ép thỏi và các trạm giao hàng hấp dẫn.",
                    category: "jobs",
                    price: 150000,
                    old_price: null,
                    badge: "",
                    image: "fas fa-hammer",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Minigame tương tác đập đá, nung quặng cuốn hút",
                        "Quặng đá tự động sinh ra và hồi phục",
                        "Giao diện lò luyện kim và bán khoáng sản trực quan",
                        "Hệ thống kiểm tra chống hack/cheat công việc"
                    ])
                },
                {
                    title: "Custom Multi-Garage System",
                    description: "Hệ thống nhà xe (Garage) đa điểm thông minh, lưu giữ vị trí xe thực tế. Hỗ trợ gửi xe ở bãi này rút ở bãi khác (có phí vận chuyển) và quản lý xe nợ thuế.",
                    category: "vehicles",
                    price: 200000,
                    old_price: 250000,
                    badge: "",
                    image: "fas fa-warehouse",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Lưu vị trí chính xác và tình trạng hỏng hóc xe",
                        "Hệ thống xe bị tịch thu (Impound) nợ thuế",
                        "Giao diện quản lý danh sách xe cực gọn gàng",
                        "Phân quyền Garage riêng cho VIP hoặc Băng đảng"
                    ])
                },
                {
                    title: "FiveM Advanced Admin Menu",
                    description: "Menu quản trị viên (Admin Menu) toàn năng tích hợp phím tắt mở nhanh. Hỗ trợ theo dõi người chơi (Spectate), Ban/Kick nhanh, hồi sinh và noclip cực mượt.",
                    category: "admin",
                    price: 300000,
                    old_price: 400000,
                    badge: "HOT",
                    image: "fas fa-user-shield",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Phím tắt mở siêu tốc, giao diện tối giản tinh tế",
                        "Chế độ theo dõi người chơi ẩn danh không giật lag",
                        "Lưu vết lịch sử Admin sử dụng lệnh qua Discord",
                        "Phân quyền lệnh Admin đồng bộ với Group/Discord Role"
                    ])
                },
                {
                    title: "Server Guard Anticheat",
                    description: "Hệ thống chống hack/cheat tối tân chuyên biệt cho máy chủ GTA5 FiveM. Ngăn chặn triệt để nạp tiền ảo, bom xe, spam event nhạy cảm và các loại menu hack phổ biến.",
                    category: "admin",
                    price: 500000,
                    old_price: 700000,
                    badge: "PROTECT",
                    image: "fas fa-shield-virus",
                    image_url: "",
                    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    features: JSON.stringify([
                        "Chặn 99% các menu hack thương mại và miễn phí",
                        "Bảo vệ và mã hóa các Trigger Event nhạy cảm",
                        "Tự động Ban vĩnh viễn và gửi thông báo qua Discord",
                        "Tối ưu thuật toán quét bộ nhớ, không gây delay máy chủ"
                    ])
                }
            ];

            for (const p of MOCK_PRODUCTS) {
                await client.query(
                    `INSERT INTO products (title, description, category, price, old_price, badge, image, image_url, video_url, features)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [p.title, p.description, p.category, p.price, p.old_price, p.badge, p.image, p.image_url, p.video_url, p.features]
                );
            }
            console.log('✔ Initial products seeded successfully');
        }

        // 9. Seeding default demo account (admin@gmail.com / 123456)
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        if (parseInt(userCount.rows[0].count) === 0) {
            console.log('🌱 Seeding default test account...');
            const passHash = await bcrypt.hash('123456', 10);
            await client.query(
                `INSERT INTO users (name, email, password_hash, balance, role)
                 VALUES ('GTA5 Developer', 'admin@gmail.com', $1, 1000000, 'admin')`,
                [passHash]
            );
            console.log('✔ Default test account created: admin@gmail.com / 123456 with 1.000.000đ balance');
        }

        await client.query('COMMIT');
        console.log('🎉 Database migration completed successfully!');
        return { success: true, message: 'Khởi tạo cơ sở dữ liệu và seed sản phẩm FiveM thành công!' };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = runMigration;

// Chạy trực tiếp nếu execute qua command line
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
