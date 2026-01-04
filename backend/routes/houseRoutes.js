const express = require('express');
const router = express.Router();
const houseController = require('../controllers/houseController');

router.get('/stats', houseController.getStats);
router.get('/', houseController.getHouses);
router.get('/:id/revenue', houseController.getHouseRevenue);
router.post('/', houseController.createHouse);

module.exports = router;

