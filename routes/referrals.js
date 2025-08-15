const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Referral = require('../models/Referral');
const { authenticate } = require('../middleware/auth');

// Get referral summary
router.get('/summary', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const referrals = await Referral.find({ referrerId: req.user.id })
            .sort({ createdAt: -1 });
        
        res.json({
            referralUrl: user.referralUrl,
            totalReferrals: referrals.length,
            earnedCoins: referrals.reduce((sum, ref) => sum + ref.coinsEarned, 0),
            referrals
        });
    } catch (error) {
        console.error('Get referrals summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get referral information (list of referred users for UI)
router.get('/', authenticate, async (req, res) => {
    try {
        const referrals = await Referral.find({ referrerId: req.user.id })
            .sort({ createdAt: -1 });
        
        const result = referrals.map(ref => ({
            username: ref.refereeUsername,
            joinedAt: ref.createdAt
        }));
        
        res.json(result);
    } catch (error) {
        console.error('Get referrals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify referral code
router.get('/verify/:code', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.code });
        
        if (!user) {
            return res.status(404).json({ exists: false });
        }
        
        res.json({ 
            exists: true,
            username: user.username
        });
    } catch (error) {
        console.error('Verify referral error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
