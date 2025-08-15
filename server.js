require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/deployments', require('./routes/deployments'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/messages', require('./routes/messages'));
// Admin API (implemented below)
app.use('/api/admin', require('./routes/admin'));

// Serve HTML files
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/dashboard.html'));
});

app.get('/deployments', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/deployments.html'));
});

app.get('/wallet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/wallet.html'));
});

app.get('/referrals', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/referrals.html'));
});

app.get('/messages', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/messages.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/settings.html'));
});

// Auth pages (simple redirects if not present)
app.get('/login', (req, res) => {
    const loginHtmlPath = path.join(__dirname, 'public/html/login.html');
    res.sendFile(loginHtmlPath, (err) => {
        if (err) res.status(404).send('Login page not found');
    });
});

app.get('/signup', (req, res) => {
    const signupHtmlPath = path.join(__dirname, 'public/html/signup.html');
    res.sendFile(signupHtmlPath, (err) => {
        if (err) res.status(404).send('Signup page not found');
    });
});

// Admin route
app.get('/admin', (req, res) => {
    const adminHtmlPath = path.join(__dirname, 'public/html/admin.html');
    res.sendFile(adminHtmlPath, (err) => {
        if (err) res.status(404).send('Admin page not found');
    });
});

// Admin login page
app.get('/admin/login', (req, res) => {
    const adminLoginPath = path.join(__dirname, 'public/html/admin-login.html');
    res.sendFile(adminLoginPath, (err) => {
        if (err) res.status(404).send('Admin login page not found');
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Create admin user if not exists
    initializeAdmin();
});

async function initializeAdmin() {
    try {
        const User = require('./models/User');
        let admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            await User.create({
                username: 'admin',
                email: 'admin@bandaheali.nodes',
                password: 'admin123',
                role: 'admin',
                coins: 1000000
            });
            console.log('Admin user created');
        }
    } catch (error) {
        console.error('Admin initialization error:', error.message);
    }
}
