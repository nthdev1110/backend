const https = require('https');

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1521845200752742472/XRpguorHP3vOP2xl88p7OhPLkVXlQg3npNpmK0rt24eTkfx7OFpEYQa4SOIY91ST9cAX';

function sendDiscordMessage(embeds) {
    if (!WEBHOOK_URL) return;

    const data = JSON.stringify({
        username: "MỘC LANE System",
        avatar_url: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/svgs/solid/shield-halved.svg",
        embeds: embeds
    });

    const url = new URL(WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
            console.error(`Discord Webhook failed with status: ${res.statusCode}`);
        }
    });

    req.on('error', (error) => {
        console.error('Discord Webhook error:', error);
    });

    req.write(data);
    req.end();
}

function sendRegisterLog(name, email, ip) {
    const embeds = [
        {
            title: "🚀 THÀNH VIÊN MỚI ĐĂNG KÝ",
            color: 0x00FF00, // Green
            fields: [
                {
                    name: "👤 Tên hiển thị",
                    value: `\`${name}\``,
                    inline: true
                },
                {
                    name: "📧 Email",
                    value: `\`${email}\``,
                    inline: true
                },
                {
                    name: "🌐 IP Truy cập",
                    value: `\`${ip || 'Không xác định'}\``,
                    inline: false
                }
            ],
            footer: {
                text: "MỘC LANE Security System"
            },
            timestamp: new Date().toISOString()
        }
    ];
    sendDiscordMessage(embeds);
}

function sendTopupLog(adminName, userName, userEmail, amount, newBalance) {
    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    const formattedBalance = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(newBalance);
    
    const isDeduction = amount < 0;
    const actionName = isDeduction ? "TRỪ TIỀN" : "CỘNG TIỀN";
    const color = isDeduction ? 0xFF0000 : 0x00BFFF; // Red for deduction, Blue for top-up

    const embeds = [
        {
            title: `💰 ADMIN VỪA ${actionName}`,
            color: color, 
            fields: [
                {
                    name: "👤 Khách hàng",
                    value: `\`${userName}\` (${userEmail})`,
                    inline: false
                },
                {
                    name: isDeduction ? "📉 Số tiền trừ" : "📈 Số tiền cộng",
                    value: `**${formattedAmount}**`,
                    inline: true
                },
                {
                    name: "🏦 Số dư mới",
                    value: `**${formattedBalance}**`,
                    inline: true
                },
                {
                    name: "👮 Người thực hiện",
                    value: `Admin: \`${adminName}\``,
                    inline: false
                }
            ],
            footer: {
                text: "MỘC LANE Transaction Log"
            },
            timestamp: new Date().toISOString()
        }
    ];
    sendDiscordMessage(embeds);
}

module.exports = {
    sendRegisterLog,
    sendTopupLog
};
