# Bandaheali Nodes

Node.js/Express app for WhatsApp bot deployment and user management by Bandah-E-Ali.

## Prerequisites
- Node.js >= 16
- MongoDB (local or hosted)

## Setup
1. Install dependencies:
```
npm install
```
2. Configure environment:
```
cp .env.example .env
# Edit .env values
```
3. Run the server (dev):
```
npm run dev
```
Or production:
```
npm start
```

Server runs on `http://localhost:${PORT}` (default 3000).

## Admin
- On first boot, an admin user is created:
  - username: `admin`
  - password: `admin123`
- Visit `/admin` to configure Heroku API keys and maintenance mode.

## API Base
- Auth: `/api/auth`
- Deployments: `/api/deployments`
- Wallet: `/api/wallet`
- Referrals: `/api/referrals`
- Settings: `/api/settings`
- Messages: `/api/messages`
- Admin: `/api/admin`

## Frontend Pages
- `/login`, `/signup`, `/dashboard`, `/deployments`, `/admin`

## Notes
- Set `MONGO_URL` and `JWT_SECRET` in `.env`.
- Configure Heroku API Keys and GitHub repo from `/admin` for deployments.