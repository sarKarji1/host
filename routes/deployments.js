const express = require('express');
const router = express.Router();
const axios = require('axios');
const Deployment = require('../models/Deployment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AdminSettings = require('../models/AdminSettings');
const { authenticate, isAdmin } = require('../middleware/auth');

// Deploy new bot
router.post('/', authenticate, async (req, res) => {
    try {
        const { appName, sessionId, config } = req.body;
        const userId = req.user.id;
        
        // Check if user has enough coins
        const user = await User.findById(userId);
        if (user.coins < 10) {
            return res.status(400).json({ error: 'Not enough coins (10 required)' });
        }
        
        // Get Heroku API key from admin settings
        const settings = await AdminSettings.findOne();
        if (!settings || !settings.herokuApiKeys || settings.herokuApiKeys.length === 0) {
            return res.status(400).json({ error: 'Heroku API keys not configured' });
        }
        const herokuKey = settings.herokuApiKeys[settings.activeHerokuKeyIndex];
        
        // 1. Create Heroku app
        const herokuHeaders = {
            'Authorization': `Bearer ${herokuKey}`,
            'Accept': 'application/vnd.heroku+json; version=3',
            'Content-Type': 'application/json'
        };
        
        const appRes = await axios.post(
            'https://api.heroku.com/apps', 
            { name: appName },
            { headers: herokuHeaders }
        );
        
        const appUrl = `https://${appName}.herokuapp.com`;
        
        // 2. Set config vars
        await axios.patch(
            `https://api.heroku.com/apps/${appName}/config-vars`,
            { SESSION_ID: sessionId, ...config },
            { headers: herokuHeaders }
        );
        
        // 3. Trigger build from GitHub
        await axios.post(
            `https://api.heroku.com/apps/${appName}/builds`,
            { 
                source_blob: { 
                    url: settings.githubRepo + '/tarball/main' 
                } 
            },
            { headers: herokuHeaders }
        );
        
        // Create deployment record
        const deployment = new Deployment({
            userId,
            appName,
            url: appUrl,
            herokuAppId: appRes.data.id,
            config: { sessionId, ...config },
            nextPaymentDue: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        
        await deployment.save();
        
        // Deduct coins from user
        user.coins -= 10;
        await user.save();
        
        // Record transaction
        const transaction = new Transaction({
            userId,
            type: 'debit',
            amount: 10,
            description: 'BANDAHEALI-MD deployment',
            reference: deployment._id,
            referenceModel: 'Deployment'
        });
        
        await transaction.save();
        
        res.json({ 
            url: appUrl,
            dashboardUrl: `https://dashboard.heroku.com/apps/${appName}`
        });
    } catch (error) {
        console.error('Deployment error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Heroku deployment failed',
            details: error.response?.data || error.message
        });
    }
});

// Get user deployments
router.get('/', authenticate, async (req, res) => {
    try {
        const deployments = await Deployment.find({ userId: req.user.id })
            .sort({ createdAt: -1 });
            
        res.json(deployments);
    } catch (error) {
        console.error('Get deployments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get deployment logs
router.get('/:id/logs', authenticate, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        
        res.json(deployment.logs);
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update deployment config
router.put('/:id/config', authenticate, async (req, res) => {
    try {
        const deployment = await Deployment.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { $set: { config: req.body } },
            { new: true }
        );
        
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        
        // Update Heroku config vars
        const settings = await AdminSettings.findOne();
        if (!settings || !settings.herokuApiKeys || settings.herokuApiKeys.length === 0) {
            return res.status(400).json({ error: 'Heroku API keys not configured' });
        }
        const herokuKey = settings.herokuApiKeys[settings.activeHerokuKeyIndex];
        
        await axios.patch(
            `https://api.heroku.com/apps/${deployment.appName}/config-vars`,
            req.body,
            { 
                headers: {
                    'Authorization': `Bearer ${herokuKey}`,
                    'Accept': 'application/vnd.heroku+json; version=3',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json(deployment);
    } catch (error) {
        console.error('Update config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Pay for suspended deployment (reactivate)
router.post('/:id/pay', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.coins < 10) {
            return res.status(400).json({ error: 'Not enough coins (10 required)' });
        }

        const deployment = await Deployment.findOne({ _id: req.params.id, userId: req.user.id });
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        user.coins -= 10;
        deployment.status = 'active';
        deployment.lastPaid = new Date();
        deployment.nextPaymentDue = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await Promise.all([user.save(), deployment.save()]);

        await new Transaction({
            userId: user._id,
            type: 'debit',
            amount: 10,
            description: `Payment for ${deployment.appName}`,
            reference: deployment._id,
            referenceModel: 'Deployment'
        }).save();

        res.json({ success: true, coins: user.coins });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete deployment
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const deployment = await Deployment.findOne({ _id: req.params.id, userId: req.user.id });
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }

        // Try to delete Heroku app if possible, but ignore failures
        try {
            const settings = await AdminSettings.findOne();
            if (settings && settings.herokuApiKeys && settings.herokuApiKeys.length > 0) {
                const herokuKey = settings.herokuApiKeys[settings.activeHerokuKeyIndex];
                await axios.delete(
                    `https://api.heroku.com/apps/${deployment.appName}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${herokuKey}`,
                            'Accept': 'application/vnd.heroku+json; version=3'
                        }
                    }
                );
            }
        } catch (e) {
            // ignore
        }

        await Deployment.deleteOne({ _id: deployment._id });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete deployment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin route to get all deployments
router.get('/admin/all', authenticate, isAdmin, async (req, res) => {
    try {
        const deployments = await Deployment.find()
            .populate('userId', 'username email')
            .sort({ createdAt: -1 });
            
        res.json(deployments);
    } catch (error) {
        console.error('Admin get deployments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
