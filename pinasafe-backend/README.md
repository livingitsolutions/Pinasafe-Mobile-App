# PinaSafe Backend API

A Node.js Express backend for the PinaSafe Emergency Response System.

## 🚀 Features

- **JWT Authentication** - Secure token-based authentication
- **Role-based Access Control** - Citizen, Responder, Admin roles
- **Emergency Reporting** - Create and manage emergency reports
- **Real-time Alerts** - System-wide alert management
- **Organization Management** - Emergency response organizations
- **Statistics & Analytics** - System and user statistics
- **Input Validation** - Comprehensive request validation
- **Error Handling** - Centralized error management
- **Security** - Helmet, CORS, rate limiting

## 📋 Prerequisites

- Node.js 18+
- Supabase account (database already configured)
- npm or yarn

## 🛠️ Installation

1. **Clone and setup:**
```bash
cd pinasafe-backend
npm install
```

2. **Configure environment:**
The `.env` file is already configured with Supabase credentials. Update if needed:
```bash
nano .env
```

3. **Start development server:**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## 🔧 Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://fxorrkfgsqlwoarozjlx.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Security
API_RATE_LIMIT=100
CORS_ORIGIN=*
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Emergency Reports
- `GET /api/emergency-reports` - List reports
- `POST /api/emergency-reports` - Create report
- `GET /api/emergency-reports/:id` - Get single report
- `PUT /api/emergency-reports/:id` - Update report status
- `POST /api/emergency-reports/calls` - Log emergency call
- `GET /api/emergency-reports/calls/user` - Get user's calls

### Alerts
- `GET /api/alerts` - Get active alerts
- `POST /api/alerts` - Create alert (responder/admin)
- `GET /api/alerts/:id` - Get single alert
- `PUT /api/alerts/:id/dismiss` - Dismiss alert

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users` - List users (admin)
- `PUT /api/users/:id/role` - Update user role (admin)

### Organizations
- `GET /api/organizations` - List organizations
- `GET /api/organizations/:id/personnel` - Get personnel

### Statistics
- `GET /api/stats/emergency` - Emergency statistics
- `GET /api/stats/user` - User statistics
- `GET /api/stats/system` - System health (admin)

## 🔒 Security Features

- **Password hashing** with bcrypt
- **JWT tokens** for authentication
- **Rate limiting** to prevent abuse
- **Input validation** with express-validator
- **CORS protection** for cross-origin requests
- **Helmet** for security headers
- **SQL injection prevention** with parameterized queries

## 🚀 Deployment

### Using PM2 (Recommended)
```bash
npm install -g pm2
pm2 start src/server.js --name pinasafe-api
pm2 startup
pm2 save
```

### Using Docker
```bash
docker build -t pinasafe-backend .
docker run -p 3000:3000 --env-file .env pinasafe-backend
```

### Cloud Platforms
- **Heroku**: `git push heroku main`
- **Railway**: Connect GitHub repo
- **DigitalOcean**: Use App Platform
- **AWS**: Use Elastic Beanstalk or ECS

## 📊 Database Schema

The API uses Supabase (PostgreSQL) with the following main tables:
- `users` - User accounts and profiles
- `emergency_reports` - Emergency incident reports with AI classification
- `emergency_calls` - Emergency service call logs
- `system_alerts` - System-wide alerts with affected areas
- `organizations` - Emergency response organizations
- `personnel` - Organization staff with specializations

All tables have Row Level Security (RLS) enabled for secure data access.

## 🧪 Testing

```bash
npm test
```

## 📝 API Documentation

Visit `/health` endpoint to verify the API is running.

Example response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.