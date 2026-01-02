
    const API_URL = 'http://localhost:3000/api';
    let currentHouseId = null; // Biến quan trọng: Lưu ID nhà đang xem

    // --- 1. UTILS (TIỆN ÍCH) ---
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '0 đ';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }

    // --- 2. MODAL LOGIC (XỬ LÝ CỬA SỔ) ---
    function openModal(modalId) {
        document.getElementById(modalId).classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('open');
        document.body.style.overflow = '';
    }

    window.onclick = function(event) {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    // --- 3. SERVICE LOGIC (XỬ LÝ DỊCH VỤ ĐỘNG) ---

    // Tạo HTML cho một dòng dịch vụ
    function createServiceRowHtml(name = '', type = 'Theo tháng', price = '') {
        return `
            <div class="service-row">
                <div style="flex: 2;">
                    <input type="text" class="form-input svc-name" placeholder="Tên DV (Điện, Wifi...)" value="${name}">
                </div>
                <div style="flex: 1.5;">
                    <select class="form-input svc-type">
                        <option value="Theo số (kWh/khối)" ${type === 'Theo số (kWh/khối)' ? 'selected' : ''}>Theo số (kWh/khối)</option>
                        <option value="Theo tháng" ${type === 'Theo tháng' ? 'selected' : ''}>Theo tháng</option>
                        <option value="Theo người" ${type === 'Theo người' ? 'selected' : ''}>Theo người</option>
                    </select>
                </div>
                <div style="flex: 1.5;">
                    <input type="text" class="form-input svc-price" placeholder="Giá tiền" value="${price}">
                </div>
                <button type="button" class="btn-remove-service" onclick="this.parentElement.remove()">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }

    // Thêm một dòng dịch vụ trống vào form
    function addServiceRow(context) { // context là 'house' hoặc 'room'
        const container = document.getElementById(`service-list-${context}`);
        container.insertAdjacentHTML('beforeend', createServiceRowHtml());
    }

    // Thu thập dữ liệu dịch vụ từ form để gửi đi
    function collectServices(context) {
        const container = document.getElementById(`service-list-${context}`);
        const rows = container.getElementsByClassName('service-row');
        const services = [];

        for (let row of rows) {
            const name = row.querySelector('.svc-name').value.trim();
            const type = row.querySelector('.svc-type').value;
            // Loại bỏ dấu chấm/phẩy trong giá tiền để gửi số nguyên về server
            let priceRaw = row.querySelector('.svc-price').value;
            let price = priceRaw.replace(/[^0-9]/g, '');

            if (name && price) {
                services.push({ name, type, price });
            }
        }
        return services;
    }

    // Logic mở Modal tạo phòng: Tự động lấy dịch vụ chung của Nhà đắp vào Form Phòng
    async function checkAndOpenRoomModal() {
        if (!currentHouseId) {
            alert("Vui lòng chọn hoặc tạo một Nhà trọ trước khi thêm phòng!");
            return;
        }

        // Reset danh sách dịch vụ cũ trong modal phòng
        const container = document.getElementById('service-list-room');
        container.innerHTML = '';

        // Gọi API lấy dịch vụ chung của nhà này
        try {
            const res = await fetch(`${API_URL}/house-services/${currentHouseId}`);
            const services = await res.json();

            if (services.length > 0) {
                // Nếu nhà có dịch vụ chung, hiển thị chúng (Kế thừa)
                services.forEach(svc => {
                    container.insertAdjacentHTML('beforeend', createServiceRowHtml(svc.name, svc.type, svc.price));
                });
            } else {
                // Nếu nhà chưa thiết lập dịch vụ, tạo sẵn 2 dòng mẫu gợi ý
                container.insertAdjacentHTML('beforeend', createServiceRowHtml('Điện', 'Theo số (kWh/khối)', '3500'));
                container.insertAdjacentHTML('beforeend', createServiceRowHtml('Nước', 'Theo người', '100000'));
            }
        } catch (err) {
            console.error("Lỗi load dịch vụ chung:", err);
            // Fallback nếu lỗi
            container.insertAdjacentHTML('beforeend', createServiceRowHtml());
        }

        openModal('modal-room');
    }


    // --- 4. DATA FETCHING (LẤY DỮ LIỆU HIỂN THỊ) ---

    // Load thống kê Dashboard
    async function loadStats() {
        try {
            const res = await fetch(`${API_URL}/stats`);
            const data = await res.json();
            document.getElementById('stat-total').innerText = data.total_rooms || 0;
            document.getElementById('stat-occupied').innerText = data.occupied || 0;
            document.getElementById('stat-vacant').innerText = data.vacant || 0;
            document.getElementById('stat-revenue').innerText = formatCurrency(data.revenue);
        } catch (err) {
            console.error("Lỗi load stats:", err);
        }
    }

    // Load danh sách Nhà trọ -> Tạo Tabs
    async function loadHouses() {
        try {
            const res = await fetch(`${API_URL}/houses`);
            const houses = await res.json();
            const container = document.getElementById('house-tabs-container');
            
            container.innerHTML = ''; // Xóa nội dung cũ

            if (houses.length === 0) {
                container.innerHTML = '<span style="font-size:0.9rem; color:#666">Chưa có nhà nào. Hãy tạo mới!</span>';
                currentHouseId = null;
            } else {
                // Nếu chưa chọn nhà nào, mặc định chọn nhà đầu tiên
                if (!currentHouseId && houses.length > 0) {
                    currentHouseId = houses[0].house_id;
                }

                houses.forEach(house => {
                    const btn = document.createElement('button');
                    const isActive = (house.house_id == currentHouseId) ? 'active' : 'inactive';
                    btn.className = `tab-btn ${isActive}`;
                    btn.innerHTML = `<i class="fas fa-home mb-1"></i> ${house.house_name}`;
                    
                    btn.onclick = () => {
                        currentHouseId = house.house_id;
                        loadHouses(); // Render lại tab để update class active
                        loadRooms(currentHouseId); // Load phòng tương ứng
                    };
                    container.appendChild(btn);
                });
            }

            // Thêm nút + vào cuối
            const addBtn = document.createElement('button');
            addBtn.className = 'tab-btn add-new';
            addBtn.innerHTML = '<i class="fas fa-plus mb-1"></i> Thêm nhà';
            addBtn.onclick = () => {
                // Reset form nhà khi mở mới
                document.getElementById('form-house').reset();
                document.getElementById('service-list-house').innerHTML = '';
                addServiceRow('house'); // Thêm 1 dòng trống
                openModal('modal-house');
            };
            container.appendChild(addBtn);

            // Load phòng cho nhà đang active
            if (currentHouseId) loadRooms(currentHouseId);

        } catch (err) {
            console.error("Lỗi load houses:", err);
        }
    }

    // Load danh sách Phòng
    async function loadRooms(houseId) {
        try {
            const res = await fetch(`${API_URL}/rooms?house_id=${houseId}`);
            const rooms = await res.json();
            const container = document.getElementById('rooms-container');
            container.innerHTML = '';

            if (rooms.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888; border:1px dashed #ddd; border-radius:8px;">Nhà này chưa có phòng nào. Hãy ấn nút "Thêm Phòng".</div>';
                return;
            }

            rooms.forEach(room => {
                let statusBadge, tenantHtml, statusBarClass;

                if (room.status === 'Occupied') {
                    statusBadge = `<span class="badge occupied">Đã thuê</span>`;
                    statusBarClass = 'green';
                    const tName = room.tenant_name || 'Khách';
                    tenantHtml = `
                        <div class="tenant-info">
                            <div class="tenant-avatar blue">${tName.substring(0,2).toUpperCase()}</div>
                            <div class="tenant-details">
                                <p class="name">${tName}</p>
                                <p class="date">HĐ đến: ${room.contract_end_date ? new Date(room.contract_end_date).toLocaleDateString('vi-VN') : '?'}</p>
                            </div>
                        </div>`;
                } else {
                    statusBadge = `<span class="badge vacant">Còn trống</span>`;
                    statusBarClass = 'red';
                    tenantHtml = `<div class="empty-state">Sẵn sàng cho thuê</div>`;
                }

                const html = `
                <div class="room-card">
                    <div class="card-body">
                        <div class="card-header">
                            <div>
                                <h4 class="room-name">Phòng ${room.room_number}</h4>
                                <div class="room-meta">
                                    <span><i class="fas fa-layer-group"></i> Tầng ${room.floor}</span> • 
                                    <span>${room.area_m2} m²</span>
                                </div>
                            </div>
                            ${statusBadge}
                        </div>
                        ${tenantHtml}
                        <div class="card-footer-info">
                            <span class="price-label">Giá thuê</span>
                            <span class="price-value">${formatCurrency(room.base_rent)}<span style="font-size:0.75rem; color:#6B7280; font-weight:400">/tháng</span></span>
                        </div>
                    </div>
                    <div class="status-bar ${statusBarClass}"></div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });
        } catch (err) {
            console.error("Lỗi load rooms:", err);
        }
    }

    // --- 5. DATA SUBMISSION (GỬI DỮ LIỆU) ---

    // Xử lý nút: Tạo Bất động sản
    async function submitHouse() {
        const name = document.getElementById('inp-house-name').value;
        const addr = document.getElementById('inp-house-addr').value;
        const desc = document.getElementById('inp-house-desc').value;

        if (!name) return alert("Vui lòng nhập tên nhà trọ!");

        // Lấy danh sách dịch vụ từ form
        const services = collectServices('house');

        const payload = {
            name: name,
            address: addr,
            description: desc,
            landlord_id: 1, // Demo ID, thực tế lấy từ token
            services: services // Gửi kèm dịch vụ
        };

        try {
            const res = await fetch(`${API_URL}/houses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("Thêm nhà thành công!");
                closeModal('modal-house');
                loadHouses(); // Tải lại danh sách nhà
            } else {
                alert("Lỗi khi thêm nhà!");
            }
        } catch (err) { console.error(err); }
    }

    // Xử lý nút: Tạo Phòng
    async function submitRoom() {
        if (!currentHouseId) return alert("Lỗi: Chưa xác định được nhà trọ!");

        const num = document.getElementById('inp-room-number').value;
        const floor = document.getElementById('inp-room-floor').value;
        const area = document.getElementById('inp-room-area').value;
        
        // Xóa ký tự không phải số ở giá thuê
        const rentRaw = document.getElementById('inp-room-rent').value;
        const rent = rentRaw.replace(/[^0-9]/g, ''); 
        
        const facilities = document.getElementById('inp-room-facilities').value;

        if (!num || !rent) return alert("Vui lòng nhập số phòng và giá thuê!");

        // Lấy danh sách dịch vụ (bao gồm cả dịch vụ kế thừa và mới)
        const services = collectServices('room');

        const payload = {
            house_id: currentHouseId,
            room_number: num,
            floor: floor,
            area: area,
            rent: rent,
            facilities: facilities,
            services: services // Gửi danh sách dịch vụ phòng
        };

        try {
            const res = await fetch(`${API_URL}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("Thêm phòng thành công!");
                closeModal('modal-room');
                loadStats(); // Cập nhật thống kê
                loadRooms(currentHouseId); // Cập nhật danh sách phòng
            } else {
                alert("Lỗi: " + (data.message || "Không thể tạo phòng"));
            }
        } catch (err) { console.error(err); }
    }

    // --- KHỞI CHẠY ---
    document.addEventListener('DOMContentLoaded', () => {
        loadStats();
        loadHouses();
    });
