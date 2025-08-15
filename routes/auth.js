const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user by username or email
        const user = await User.findOne({ 
            $or: [{ username }, { email: username }] 
        });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({ 
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic,
                coins: user.coins,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin login route (username/password, enforces admin role)
router.post('/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ 
            $or: [{ username }, { email: username }],
            role: 'admin'
        });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }
        if (!user.isActive) {
            return res.status(403).json({ error: 'Admin account suspended' });
        }
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        user.lastLogin = new Date();
        await user.save();
        res.json({ token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Google OAuth: verify Google ID token from client (One Tap or button)
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'Missing Google idToken' });

        // Verify Google token
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;

        let user = await User.findOne({ $or: [{ googleId }, { email }] });
        if (!user) {
            const generatedUsername = (email?.split('@')[0] || `user_${googleId.slice(-6)}`).toLowerCase();
            // Ensure unique username
            let uniqueUsername = generatedUsername;
            let suffix = 1;
            while (await User.findOne({ username: uniqueUsername })) {
                uniqueUsername = `${generatedUsername}${suffix++}`;
            }
            user = await User.create({
                username: uniqueUsername,
                email,
                authProvider: 'google',
                googleId,
                name,
                profilePic: picture
            });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        user.lastLogin = new Date();
        await user.save();

        res.json({ token });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

// Signup route
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password, referralCode } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email }] 
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Create new user
        const user = new User({
            username,
            email,
            password,
            referredBy: referralCode
        });

        await user.save();

        // Handle referral if exists
        if (referralCode) {
            await handleReferral(referralCode, user);
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.status(201).json({ 
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic,
                coins: user.coins,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user
router.get('/user', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -__v');
            
        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to handle referrals
async function handleReferral(referralCode, newUser) {
    const Referral = require('../models/Referral');
    const referrer = await User.findOne({ username: referralCode });
    if (!referrer) return;
    
    if (!referrer.referrals.includes(newUser.username)) {
        referrer.referrals.push(newUser.username);
        referrer.coins += 5; // 5 coins for referral
        await referrer.save();
    }
    
    try {
        await Referral.create({
            referrerId: referrer._id,
            refereeId: newUser._id,
            refereeUsername: newUser.username,
            coinsEarned: 5
        });
    } catch (e) {
        // Ignore duplicate refereeId errors due to unique index
    }
}

// Middleware to authenticate JWT
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
}

// Expose auth config
router.get('/config', (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

module.exports = router;
