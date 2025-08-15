const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const AdminSettings = require('../models/AdminSettings');
const User = require('../models/User');
const Deployment = require('../models/Deployment');

// Get admin dashboard data
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const settings = await AdminSettings.findOne();
        res.json({
            herokuKeys: settings?.herokuApiKeys || [],
            maintenance: settings?.maintenance || false,
            maintenanceMessage: settings?.maintenanceMessage || ''
        });
    } catch (error) {
        console.error('Admin data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Heroku API keys
router.put('/heroku-keys', authenticate, isAdmin, async (req, res) => {
    try {
        const { keys } = req.body;
        if (!Array.isArray(keys)) {
            return res.status(400).json({ error: 'keys must be an array' });
        }
        const settings = await AdminSettings.findOneAndUpdate(
            {},
            { $set: { herokuApiKeys: keys, activeHerokuKeyIndex: 0, updatedAt: new Date() } },
            { upsert: true, new: true }
        );
        res.json({ herokuKeys: settings.herokuApiKeys });
    } catch (error) {
        console.error('Update Heroku keys error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Toggle maintenance mode
router.put('/maintenance', authenticate, isAdmin, async (req, res) => {
    try {
        const { maintenance, message } = req.body;
        const settings = await AdminSettings.findOneAndUpdate(
            {},
            { $set: { maintenance: !!maintenance, maintenanceMessage: message || '', updatedAt: new Date() } },
            { upsert: true, new: true }
        );
        res.json({ maintenance: settings.maintenance, maintenanceMessage: settings.maintenanceMessage });
    } catch (error) {
        console.error('Maintenance update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List users with deployments count
router.get('/users', authenticate, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('username email coins isActive role');
        const deploymentCounts = await Deployment.aggregate([
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(deploymentCounts.map(d => [String(d._id), d.count]));
        const result = users.map(u => ({
            _id: u._id,
            username: u.username,
            email: u.email,
            coins: u.coins,
            isActive: u.isActive,
            role: u.role,
            deploymentsCount: countMap.get(String(u._id)) || 0
        }));
        res.json(result);
    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Ban/unban user
router.put('/users/:id/ban', authenticate, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.isActive = !user.isActive;
        await user.save();
        res.json({ isActive: user.isActive });
    } catch (error) {
        console.error('Ban user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List all deployments
router.get('/deployments', authenticate, isAdmin, async (req, res) => {
    try {
        const deployments = await Deployment.find().populate('userId', 'username').sort({ createdAt: -1 });
        const result = deployments.map(d => ({
            _id: d._id,
            appName: d.appName,
            user: { username: d.userId.username },
            status: d.status,
            lastPaid: d.lastPaid,
            url: d.url
        }));
        res.json(result);
    } catch (error) {
        console.error('List deployments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;