const express = require('express');
const router = express.Router();
const tenantDashboardController = require('../controllers/tenantDashboardController');

// Tổng quan phòng trọ hiện tại
router.get('/overview', tenantDashboardController.getOverview);

// Danh sách phòng đang thuê (để chuyển phòng)
router.get('/rooms', tenantDashboardController.getRooms);

// Chi phí hàng tháng
router.get('/monthly-expenses', tenantDashboardController.getMonthlyExpenses);

// Mức sử dụng điện và nước
router.get('/utility-usage', tenantDashboardController.getUtilityUsage);

// Thanh toán gần đây
router.get('/recent-payments', tenantDashboardController.getRecentPayments);

// Yêu cầu bảo trì theo phòng trọ
router.get('/maintenance-requests', tenantDashboardController.getMaintenanceRequests);

// Thanh toán tiếp theo
router.get('/next-payment', tenantDashboardController.getNextPayment);

module.exports = router;

