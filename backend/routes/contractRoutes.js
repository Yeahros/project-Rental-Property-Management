const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const upload = require('../config/multer');

router.get('/', contractController.getContracts);
router.get('/stats', contractController.getContractStats);
router.get('/active', contractController.getActiveContracts);
router.get('/:id', contractController.getContractById);
router.post('/', upload.fields([
    { name: 'cccd_front', maxCount: 1 },
    { name: 'cccd_back', maxCount: 1 },
    { name: 'contract_pdf', maxCount: 1 }
]), contractController.createContract);
router.put('/:id', contractController.updateContract);
router.put('/:id/terminate', contractController.terminateContract);

module.exports = router;

