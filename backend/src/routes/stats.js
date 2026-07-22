const express = require('express');
const requireAuth = require('../middleware/auth');
const statsController = require('../controllers/statsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', statsController.getStats);
router.get('/crosstab', statsController.getCrosstab);
router.get('/summary', statsController.getSummary);
router.get('/trend', statsController.getTrend);

module.exports = router;
