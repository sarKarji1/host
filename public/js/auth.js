document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    window.location.href = '/dashboard';
                } else {
                    showError(data.error || 'Login failed');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('signup-username').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const referralCode = document.getElementById('referral-code').value;

            try {
                const response = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password, referralCode })
                });

                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    window.location.href = '/dashboard';
                } else {
                    showError(data.error || 'Signup failed');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        });
    }

    // Google Sign-In setup
    setupGoogleSignIn();

    function showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        document.body.appendChild(errorElement);
        setTimeout(() => errorElement.remove(), 3000);
    }

    async function setupGoogleSignIn() {
        const googleBtn = document.getElementById('google-btn');
        if (!googleBtn) return;
        try {
            const res = await fetch('/api/auth/config');
            const { googleClientId } = await res.json();
            if (!googleClientId) return;
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;
            google.accounts.id.initialize({
                client_id: googleClientId,
                callback: async ({ credential }) => {
                    await handleGoogleCredential(credential);
                }
            });
            google.accounts.id.renderButton(googleBtn, {
                theme: 'outline',
                size: 'large',
                shape: 'pill',
                width: googleBtn.clientWidth || 240
            });
            google.accounts.id.prompt();
        } catch (e) {
            // silent
        }
    }

    async function handleGoogleCredential(idToken) {
        try {
            const response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                window.location.href = '/dashboard';
            } else {
                showError(data.error || 'Google sign-in failed');
            }
        } catch (e) {
            showError('Network error. Please try again.');
        }
    }
});
