const API_URL = 'http://localhost:3000/api';

// Helper format tiền
const formatMoney = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

// Helper tính thời gian (ví dụ: 2 giờ trước)
function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
}

async function loadDashboard() {
    // 1. Load Stats Cards
    try {
        const res = await fetch(`${API_URL}/dashboard/stats`);
        const data = await res.json();
        
        // Cập nhật DOM (Dựa theo thứ tự card trong HTML của bạn nếu không có ID, hoặc thêm ID vào HTML để chính xác hơn)
        const statValues = document.querySelectorAll('.stat-value');
        const statNotes = document.querySelectorAll('.stat-note');

        if(statValues.length >= 4) {
            // Card 1: Tổng Bất động sản
            statValues[0].innerText = data.total_houses;
            
            // Card 2: Tỷ lệ lấp đầy
            statValues[1].innerText = data.occupancy_rate + '%';
            statNotes[0].innerText = `${data.occupied_count} trên ${data.total_rooms} phòng đã thuê`;

            // Card 3: Doanh thu
            statValues[2].innerText = formatMoney(data.revenue_month);
            statNotes[1].innerText = 'Doanh thu thực tế tháng này';

            // Card 4: Bảo trì
            statValues[3].innerText = data.maintenance_active;
            statNotes[2].innerText = `${data.maintenance_processing} đang xử lý`;
        }
    } catch(e) { console.error("Stats Error", e); }

    // 2. Load Chart (Biểu đồ)
    try {
        const res = await fetch(`${API_URL}/dashboard/chart`);
        const chartData = await res.json();
        
        const chartContainer = document.querySelector('.chart-container');
        const chartLabels = document.querySelector('.chart-labels');
        
        // Xóa dữ liệu mẫu cũ (trừ grid lines)
        const gridLines = chartContainer.querySelector('.chart-grid-lines').outerHTML;
        chartContainer.innerHTML = gridLines; 
        chartLabels.innerHTML = '';

        // Tìm giá trị lớn nhất để tính chiều cao %
        const maxVal = Math.max(...chartData.map(d => parseInt(d.total))) || 1;

        chartData.forEach(item => {
            const heightPercent = (item.total / maxVal) * 80; // Max height 80% container
            
            // Tạo cột
            const bar = document.createElement('div');
            bar.className = 'chart-bar blue'; // Có thể logic đổi màu nếu là tháng hiện tại
            bar.style.height = `${heightPercent}%`;
            bar.style.width = '10%'; // Độ rộng cột
            bar.innerHTML = `<div class="chart-tooltip">${(item.total / 1000000).toFixed(1)}M</div>`;
            chartContainer.appendChild(bar);

            // Tạo nhãn tháng
            const label = document.createElement('span');
            label.innerText = item.month_year.split('/')[0]; // Lấy tháng
            chartLabels.appendChild(label);
        });

    } catch(e) { console.error("Chart Error", e); }

    // 3. Load Upcoming Payments
    try {
        const res = await fetch(`${API_URL}/dashboard/upcoming-payments`);
        const payments = await res.json();
        const list = document.querySelector('.payment-list');
        list.innerHTML = '';

        payments.forEach(p => {
            const date = new Date(p.due_date);
            const dayMonth = `${date.getDate()}/${date.getMonth()+1}`;
            
            // Random màu icon cho đẹp
            const colors = ['blue', 'indigo', 'sky', 'purple'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            const html = `
            <div class="payment-item">
                <div class="payment-room ${color}">P${p.room_number}</div>
                <div class="payment-details">
                    <p class="payment-name">${p.full_name}</p>
                    <p class="payment-date">
                        <span class="material-icons-outlined payment-date-icon">schedule</span> ${dayMonth}
                    </p>
                </div>
                <div class="payment-amount">
                    <p class="payment-amount-value ${color}">${parseInt(p.total_amount).toLocaleString('vi-VN')}</p>
                    <p class="payment-status danger">Chưa thu</p>
                </div>
            </div>`;
            list.innerHTML += html;
        });
    } catch(e) { console.error("Payment Error", e); }

    // 4. Load Recent Activities
    try {
        const res = await fetch(`${API_URL}/dashboard/activities`);
        const activities = await res.json();
        const actList = document.querySelector('.activity-list');
        actList.innerHTML = '';

        activities.forEach(act => {
            let icon = 'notifications';
            let color = 'blue';
            let title = 'Thông báo';
            let desc = '';

            if(act.type === 'payment') {
                icon = 'attach_money'; color = 'green'; title = 'Đã nhận thanh toán';
                desc = `${formatMoney(act.val)} - ${act.full_name} (P.${act.room_number})`;
            } else if (act.type === 'maintenance') {
                icon = 'build'; color = 'orange'; title = 'Yêu cầu bảo trì mới';
                desc = `${act.val} - P.${act.room_number}`;
            } else if (act.type === 'tenant') {
                icon = 'person_add'; color = 'teal'; title = 'Người thuê mới';
                desc = `${act.full_name} - P.${act.room_number}`;
            }

            const html = `
            <div class="activity-item">
                <div class="activity-icon ${color}">
                    <span class="material-icons-outlined">${icon}</span>
                </div>
                <div class="activity-content">
                    <div class="activity-header">
                        <h4 class="activity-title">${title}</h4>
                        <span class="activity-time">${timeAgo(act.created_at)}</span>
                    </div>
                    <p class="activity-desc">${desc}</p>
                </div>
            </div>`;
            actList.innerHTML += html;
        });
    } catch(e) { console.error("Activity Error", e); }

    // 5. Load Top Properties
    try {
        const res = await fetch(`${API_URL}/dashboard/top-properties`);
        const props = await res.json();
        const propList = document.querySelector('.property-list');
        propList.innerHTML = '';

        props.forEach(p => {
            const percent = Math.round((p.occupied_rooms / p.total_rooms) * 100) || 0;
            const html = `
            <div class="property-card">
                <div class="property-header">
                    <h4 class="property-name">${p.house_name}</h4>
                    <span class="material-icons-outlined property-trend up">trending_up</span>
                </div>
                <div class="property-stats">
                    <div>
                        <p class="property-stat-label">Phòng</p>
                        <p class="property-stat-value">${p.total_rooms}</p>
                    </div>
                    <div>
                        <p class="property-stat-label">Đã thuê</p>
                        <p class="property-stat-value primary">${p.occupied_rooms}/${p.total_rooms}</p>
                    </div>
                    <div class="property-stat-value right">
                        <p class="property-stat-label">Doanh thu</p>
                        <p class="property-stat-value blue">${(p.estimated_revenue / 1000000).toFixed(1)}tr</p>
                    </div>
                </div>
                <div class="property-progress">
                    <div class="property-progress-bar" style="width: ${percent}%"></div>
                </div>
            </div>`;
            propList.innerHTML += html;
        });
    } catch(e) { console.error("Property Error", e); }
}

// Chạy khi trang load xong
document.addEventListener('DOMContentLoaded', loadDashboard);

