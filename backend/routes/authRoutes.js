const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register/landlord', authController.registerLandlord);
router.post('/login/landlord', authController.loginLandlord);
router.post('/login/tenant', authController.loginTenant);

module.exports = router;

